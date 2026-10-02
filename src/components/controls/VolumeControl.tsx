import { MAX_VOLUME } from '../../utils'

interface VolumeControlProps {
  volume: number
  setVolume: (v: number) => void
}

export function VolumeControl({ volume, setVolume }: VolumeControlProps) {
  const fillPercent = `${Math.min(100, Math.max(0, (volume / MAX_VOLUME) * 100))}%`
  return (
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
        style={{ '--fill': fillPercent } as React.CSSProperties}
      />
    </div>
  )
}
