import type { PlaylistItem } from '../hooks/usePlaylist'

interface PlaylistPanelProps {
  open: boolean
  queue: PlaylistItem[]
  currentIndex: number
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onClear: () => void
  onClose: () => void
}

export function PlaylistPanel({ open, queue, currentIndex, onPlay, onRemove, onClear, onClose }: PlaylistPanelProps) {
  if (!open) return null
  return (
    <div className="playlist-panel" onClick={(e) => e.stopPropagation()}>
      <div className="playlist-panel__header">
        <span className="playlist-panel__title">File d'attente ({queue.length})</span>
        <button type="button" className="icon-btn" aria-label="Vider la file" onClick={onClear}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <ul className="playlist-panel__list">
        {queue.map((item, i) => (
          <li
            key={`${i}-${item.path}`}
            className={`playlist-panel__item${i === currentIndex ? ' is-current' : ''}`}
            onClick={() => onPlay(i)}
          >
            <span className="playlist-panel__name" title={item.path}>{item.name}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Retirer ${item.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(i)
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </li>
        ))}
        {queue.length === 0 && (
          <li className="playlist-panel__empty">File vide — déposez des vidéos</li>
        )}
      </ul>
    </div>
  )
}
