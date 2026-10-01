import { formatTime, MAX_VOLUME } from '../utils'

interface ControlsProps {
  paused: boolean
  volume: number
  filename: string | null
  isFullscreen: boolean
  togglePause: () => void
  toggleFullscreen: () => void
  setVolume: (v: number) => void
  onOpenFile: () => void
  onSeekChange: (t: number) => void
  onSeekCommit: (t: number) => void
  seekingRef: React.MutableRefObject<boolean>
  timePos: number | null
  duration: number | null
}

export function Controls(props: ControlsProps) {
  const {
    paused, volume, filename, isFullscreen,
    togglePause, toggleFullscreen, setVolume, onOpenFile,
    onSeekChange, onSeekCommit, seekingRef, timePos, duration,
  } = props
  return (
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
          onChange={(e) => {
            seekingRef.current = true
            onSeekChange(Number(e.target.value))
          }}
          onMouseUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
          onKeyUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
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
            onChange={(e) => setVolume(Number(e.target.value))}
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
        <button type="button" className="icon-btn" onClick={onOpenFile} aria-label="Ouvrir un autre fichier">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
