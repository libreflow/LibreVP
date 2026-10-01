import { useCallback, useEffect, useRef, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
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

const MAX_VOLUME = 130

function formatTime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? m.toString().padStart(2, '0') : `${m}`
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const VIDEO_EXTENSIONS = [
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'ts', 'mpg', 'mpeg',
]

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS)

function hasVideoExtension(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return VIDEO_EXTENSION_SET.has(path.slice(dot + 1).toLowerCase())
}

// When several files are dropped at once, prefer the first one that looks
// like a video instead of blindly taking paths[0] (which may be a subtitle
// or artwork file dropped alongside the movie).
function pickSupportedFile(paths: string[]): string | null {
  return paths.find((p) => hasVideoExtension(p)) ?? paths[0] ?? null
}

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [timePos, setTimePos] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(100)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const seekingRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyRef = useRef(false)

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
      setPaused(actuallyPaused ?? false)
    } catch (e) {
      setError(`Impossible de lire ce fichier : ${String(e)}`)
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
      await loadFile(path)
    } catch (e) {
      setError(`Impossible d'ouvrir le sélecteur de fichier : ${String(e)}`)
    }
  }, [loadFile])

  // Accept a video file dropped onto the window (native OS drag-drop, not
  // the HTML5 DnD API — mpv's video surface sits behind the webview and
  // would otherwise swallow the drop before any HTML listener sees it).
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'enter') setIsDragOver(true)
        if (event.payload.type === 'leave') setIsDragOver(false)
        if (event.payload.type === 'drop') {
          setIsDragOver(false)
          const path = pickSupportedFile(event.payload.paths)
          if (path && readyRef.current) void loadFile(path)
        }
      })
    })()
    return () => unlisten?.()
  }, [loadFile])

  const toggleFullscreen = useCallback(() => {
    const win = getCurrentWindow()
    void win.isFullscreen().then((fs) => {
      void win.setFullscreen(!fs).catch((e) => setError(`Plein écran indisponible : ${String(e)}`))
      setIsFullscreen(!fs)
    })
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

  // Global keyboard shortcuts. Read current state via refs rather than
  // re-binding the listener on every state change (avoids churn and keeps
  // a single, stable keydown handler for the window's lifetime).
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const hasMediaRef = useRef(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't hijack typing in a focused input (e.g. a future search box).
      if (e.target instanceof HTMLInputElement) return
      // Let Space activate a focused button natively instead of also firing
      // the play/pause shortcut (double action on a single keypress).
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (hasMediaRef.current) void setProperty('pause', !pausedRef.current)
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'Escape':
          if (isFullscreen) toggleFullscreen()
          break
        case 'ArrowRight':
          e.preventDefault()
          void command('seek', [5, 'relative'])
          break
        case 'ArrowLeft':
          e.preventDefault()
          void command('seek', [-5, 'relative'])
          break
        case 'ArrowUp':
          e.preventDefault()
          void setProperty('volume', Math.min(MAX_VOLUME, volume + 5))
          break
        case 'ArrowDown':
          e.preventDefault()
          void setProperty('volume', Math.max(0, volume - 5))
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refs carry fresh values, volume/isFullscreen rebind only when they truly change
  }, [isFullscreen, volume, toggleFullscreen])

  const hasMedia = filename != null
  hasMediaRef.current = hasMedia

  return (
    <div
      className={`player${hasMedia ? ' has-media' : ''}${showControls ? ' show-controls' : ''}${isDragOver ? ' drag-over' : ''}`}
      onMouseMove={onPointerActivity}
      onClick={hasMedia ? togglePause : undefined}
      onDoubleClick={hasMedia ? toggleFullscreen : undefined}
    >
      {error && <div className="error-banner error-banner--overlay">{error}</div>}
      {isDragOver && (
        <div className="drag-overlay">Déposer la vidéo pour la lire</div>
      )}

      {!hasMedia && (
        <div className="drop-zone">
          <div className="drop-zone__title">LibreVP</div>
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
              max={MAX_VOLUME}
              value={volume}
              onChange={onVolumeChange}
            />
          </div>
          <span className="filename">{filename ?? ''}</span>
          <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}>
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" /></svg>
            )}
          </button>
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
