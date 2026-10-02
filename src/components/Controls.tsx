import { SeekBar } from './controls/SeekBar'
import { VolumeControl } from './controls/VolumeControl'

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
      <SeekBar
        timePos={timePos}
        duration={duration}
        seekingRef={seekingRef}
        onSeekChange={onSeekChange}
        onSeekCommit={onSeekCommit}
      />
      <div className="bottom-row">
        <button type="button" className="icon-btn" onClick={togglePause} aria-label={paused ? 'Lecture' : 'Pause'}>
          {paused ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          )}
        </button>
        <VolumeControl volume={volume} setVolume={setVolume} />
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
