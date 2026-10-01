import { useCallback, useEffect, useRef, useState } from 'react'
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

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['volume', 'int64'],
] as const satisfies MpvObservableProperty[]

// Reserve space at the bottom of the mpv video surface so our HTML control
// bar never overlaps the picture itself.
const CONTROLS_MARGIN_RATIO = 0.1

export interface PlayerState {
  ready: boolean
  error: string | null
  filename: string | null
  paused: boolean
  timePos: number | null
  duration: number | null
  volume: number
}

export function usePlayer(): PlayerState & {
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
        await setVideoMarginRatio({ bottom: CONTROLS_MARGIN_RATIO })
        unlisten = await observeProperties(OBSERVED_PROPERTIES, (event) => {
          switch (event.name) {
            case 'pause':
              pausedRef.current = event.data
              setPaused(event.data)
              break
            case 'time-pos':
              if (!seekingRef.current) setTimePos(event.data)
              break
            case 'duration':
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

  const loadFile = useCallback(async (path: string) => {
    setError(null)
    try {
      await command('loadfile', [path])
      // mpv starts playback automatically on loadfile; read the REAL state
      // back instead of assuming one, since observeProperties only fires on
      // CHANGE and never emits if our guess already matched reality.
      const actuallyPaused = await getProperty('pause', 'flag')
      pausedRef.current = actuallyPaused ?? false
      setPaused(actuallyPaused ?? false)
    } catch (e) {
      setError(`Impossible de lire ce fichier : ${String(e)}`)
    }
  }, [])

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
