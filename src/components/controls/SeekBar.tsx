import { formatTime } from '../../utils'

interface SeekBarProps {
  timePos: number | null
  duration: number | null
  seekingRef: React.MutableRefObject<boolean>
  onSeekChange: (t: number) => void
  onSeekCommit: (t: number) => void
}

export function SeekBar({ timePos, duration, seekingRef, onSeekChange, onSeekCommit }: SeekBarProps) {
  const fillPercent = duration != null && duration > 0
    ? `${Math.min(100, Math.max(0, ((timePos ?? 0) / duration) * 100))}%`
    : '0%'
  return (
    <div className="seek-row">
      <span className="time">{formatTime(timePos)}</span>
      <input
        type="range"
        className="seek-bar"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={timePos ?? 0}
        style={{ '--fill': fillPercent } as React.CSSProperties}
        onChange={(e) => {
          seekingRef.current = true
          onSeekChange(Number(e.target.value))
        }}
        onMouseUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
        onTouchEnd={(e) => onSeekCommit(Number(e.currentTarget.value))}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  )
}
