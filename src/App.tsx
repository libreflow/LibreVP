import { useCallback, useEffect, useRef, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
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
import './App.css'

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

function formatTime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const VIDEO_EXTENSIONS = [
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'ts', 'mpg', 'mpeg',
]

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [timePos, setTimePos] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(100)
  const [showControls, setShowControls] = useState(true)
  const seekingRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
              setVolume(event.data)
              break
          }
        })
        setReady(true)
      } catch (e) {
        setError(`Échec d'initialisation du lecteur : ${String(e)}`)
      }
    })()

    return () => {
      cancelled = true
      unlisten?.()
      void destroy()
    }
  }, [])

  const openFile = useCallback(async () => {
    setError(null)
    try {
      const path = await openFileDialog({
        title: 'Ouvrir une vidéo',
        multiple: false,
        filters: [{ name: 'Vidéo', extensions: VIDEO_EXTENSIONS }],
      })
      if (!path || Array.isArray(path)) return
      await command('loadfile', [path])
      // mpv starts playback automatically on loadfile; read the REAL state
      // back instead of assuming one, since observeProperties only fires on
      // CHANGE and never emits if our guess already matched reality.
      const actuallyPaused = await getProperty('pause', 'flag')
      setPaused(actuallyPaused ?? false)
    } catch (e) {
      setError(`Impossible de lire ce fichier : ${String(e)}`)
    }
  }, [])

  const togglePause = useCallback(() => {
    void setProperty('pause', !paused)
  }, [paused])

  const onSeekInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    seekingRef.current = true
    setTimePos(Number(e.target.value))
  }, [])

  const onSeekCommit = useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    void command('seek', [Number(e.currentTarget.value), 'absolute']).finally(() => {
      seekingRef.current = false
    })
  }, [])

  const onVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setVolume(v)
    void setProperty('volume', v)
  }, [])

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2600)
  }, [])

  const onPointerActivity = useCallback(() => {
    setShowControls(true)
    scheduleHideControls()
  }, [scheduleHideControls])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  const hasMedia = filename != null

  return (
    <div
      className={`player${hasMedia ? ' has-media' : ''}${showControls ? ' show-controls' : ''}`}
      onMouseMove={onPointerActivity}
      onClick={hasMedia ? togglePause : undefined}
    >
      {!hasMedia && (
        <div className="drop-zone">
          <div className="drop-zone__title">LibreVP</div>
          {error && <div className="error-banner">{error}</div>}
          <button
            type="button"
            className="open-btn"
            disabled={!ready}
            onClick={(e) => {
              e.stopPropagation()
              void openFile()
            }}
          >
            {ready ? 'Ouvrir une vidéo…' : 'Initialisation du lecteur…'}
          </button>
        </div>
      )}

      <div className="controls" onClick={(e) => e.stopPropagation()}>
        <div className="seek-row">
          <span className="time">{formatTime(timePos)}</span>
          <input
            type="range"
            className="seek-bar"
            min={0}
            max={duration ?? 0}
            step={0.1}
            value={timePos ?? 0}
            onChange={onSeekInput}
            onMouseUp={onSeekCommit}
            onKeyUp={onSeekCommit}
          />
          <span className="time">{formatTime(duration)}</span>
        </div>
        <div className="bottom-row">
          <button type="button" className="icon-btn" onClick={togglePause} aria-label={paused ? 'Lecture' : 'Pause'}>
            {paused ? (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            )}
          </button>
          <div className="volume-row">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M3 10v4h4l5 5V5L7 10H3z" />
            </svg>
            <input
              type="range"
              className="volume-bar"
              min={0}
              max={130}
              value={volume}
              onChange={onVolumeChange}
            />
          </div>
          <span className="filename">{filename ?? ''}</span>
          <button type="button" className="icon-btn" onClick={() => void openFile()} aria-label="Ouvrir un autre fichier">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
