import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  init,
  destroy,
  observeProperties,
  command,
  setProperty,
  getProperty,
  setVideoMarginRatio,
  type MpvObservableProperty,
} from 'tauri-plugin-libmpv-api'
import { CONTROLS_MARGIN_RATIO } from '../utils'
import { getResumePosition, saveResumePosition } from '../resume'

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['volume', 'int64'],
] as const satisfies MpvObservableProperty[]

// How often to persist the resume position while playing (seconds of
// wall-clock time between writes). A crash/power loss between two
// checkpoints loses at most this much progress -- cheap tradeoff against
// writing to disk on every time-pos tick (several times a second).
const RESUME_SAVE_INTERVAL_MS = 5000

export interface PlayerState {
  ready: boolean
  error: string | null
  filename: string | null
  paused: boolean
  timePos: number | null
  duration: number | null
  volume: number
}

export function usePlayer(showControls: boolean): PlayerState & {
  loadFile: (path: string) => Promise<void>
  seekingRef: React.MutableRefObject<boolean>
  readyRef: React.MutableRefObject<boolean>
  setTimePos: (t: number) => void
  togglePause: () => void
  setVolume: (v: number) => void
} {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [timePos, setTimePos] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolumeState] = useState(100)
  const seekingRef = useRef(false)
  const readyRef = useRef(false)
  const pausedRef = useRef(true)
  // Full path of the currently loaded file, as passed to loadFile -- NOT
  // the same as `filename` (mpv's observed 'filename' property is just the
  // basename, which is ambiguous as a resume-map key across directories).
  const currentPathRef = useRef<string | null>(null)
  const timePosRef = useRef<number | null>(null)
  const durationRef = useRef<number | null>(null)
  const resumeSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist the current playback position for the currently-loaded file.
  // Stable across renders (reads everything from refs) so it's safe to
  // reference from the init effect's observeProperties callback, the
  // periodic timer, loadFile (for the file being LEFT), and the
  // window-close handler alike.
  const flushResumeSave = useCallback(async () => {
    const path = currentPathRef.current
    const pos = timePosRef.current
    const dur = durationRef.current
    if (!path || pos == null) return
    await saveResumePosition(path, pos, dur ?? 0)
  }, [])

  // Initialize mpv once, embedded in this window.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      try {
        await init({
          initialOptions: {
            vo: 'gpu-next',
            hwdec: 'auto-safe',
            'keep-open': 'yes',
            'force-window': 'yes',
          },
          observedProperties: OBSERVED_PROPERTIES,
        })
        if (cancelled) return
        unlisten = await observeProperties(OBSERVED_PROPERTIES, (event) => {
          switch (event.name) {
            case 'pause':
              pausedRef.current = event.data
              setPaused(event.data)
              // Checkpoint immediately on pause -- the user stopping to
              // step away is exactly the moment a resume point matters
              // most, don't wait for the next periodic tick.
              if (event.data) void flushResumeSave()
              break
            case 'time-pos':
              timePosRef.current = event.data
              if (!seekingRef.current) setTimePos(event.data)
              break
            case 'duration':
              durationRef.current = event.data
              setDuration(event.data)
              break
            case 'filename':
              setFilename(event.data)
              break
            case 'volume':
              setVolumeState(event.data)
              break
          }
        })
        setReady(true)
        readyRef.current = true
      } catch (e) {
        setError(`Échec d'initialisation du lecteur : ${String(e)}`)
      }
    })()

    return () => {
      cancelled = true
      unlisten?.()
      // Only destroy when init actually completed; otherwise a StrictMode
      // double-mount would call destroy() on an uninitialized player.
      if (readyRef.current) {
        readyRef.current = false
        void destroy().catch(() => {})
      }
    }
  }, [])

  // Keep mpv's reserved bottom margin in sync with the HTML control bar's
  // real visibility instead of reserving it permanently. Reserving it
  // unconditionally centred the picture in a permanently-shrunk region, so
  // the video sat visibly off-centre (extra black bar at the bottom) every
  // time the controls auto-hid after a few seconds of inactivity.
  useEffect(() => {
    if (!ready) return
    void setVideoMarginRatio({ bottom: showControls ? CONTROLS_MARGIN_RATIO : 0 })
  }, [ready, showControls])

  // Periodic resume checkpoint while playing, so a crash or power loss
  // between pauses loses at most RESUME_SAVE_INTERVAL_MS of progress. The
  // pause-triggered save above handles the common "user steps away" case;
  // this covers the uncommon "app dies mid-playback" case.
  useEffect(() => {
    if (!ready) return
    resumeSaveTimerRef.current = setInterval(() => void flushResumeSave(), RESUME_SAVE_INTERVAL_MS)
    return () => {
      if (resumeSaveTimerRef.current) clearInterval(resumeSaveTimerRef.current)
    }
  }, [ready, flushResumeSave])

  // Also checkpoint when the window is about to close -- the periodic timer
  // alone could miss up to RESUME_SAVE_INTERVAL_MS of progress right before
  // a clean quit. Await the save (not fire-and-forget): onCloseRequested's
  // wrapper awaits this handler before letting the window actually close,
  // so a bare `void flushResumeSave()` would race the write against
  // process exit and could lose it.
  useEffect(() => {
    if (!ready) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWindow().onCloseRequested(async () => {
        await flushResumeSave()
      })
    })()
    return () => unlisten?.()
  }, [ready, flushResumeSave])

  const loadFile = useCallback(async (path: string) => {
    setError(null)
    try {
      // Checkpoint whatever was playing before switching away from it --
      // otherwise navigating to a new file without ever pausing the
      // previous one would silently lose its resume position.
      await flushResumeSave()
      currentPathRef.current = path
      timePosRef.current = null
      durationRef.current = null
      await command('loadfile', [path])
      // mpv starts playback automatically on loadfile; read the REAL state
      // back instead of assuming one, since observeProperties only fires on
      // CHANGE and never emits if our guess already matched reality.
      const actuallyPaused = await getProperty('pause', 'flag')
      pausedRef.current = actuallyPaused ?? false
      setPaused(actuallyPaused ?? false)

      // Resume where we left off, if we have a remembered position for
      // THIS exact path (not just "some" file -- see getResumePosition's
      // own threshold logic for "too close to start"/"already finished").
      const resumeAt = await getResumePosition(path)
      if (resumeAt != null && currentPathRef.current === path) {
        await command('seek', [resumeAt, 'absolute'])
        timePosRef.current = resumeAt
        setTimePos(resumeAt)
      }
    } catch (e) {
      setError(`Impossible de lire ce fichier : ${String(e)}`)
    }
  }, [flushResumeSave])

  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    pausedRef.current = next
    void setProperty('pause', next)
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    void setProperty('volume', v)
  }, [])

  return {
    ready,
    error,
    filename,
    paused,
    timePos,
    duration,
    volume,
    loadFile,
    seekingRef,
    readyRef,
    setTimePos,
    togglePause,
    setVolume,
  }
}
