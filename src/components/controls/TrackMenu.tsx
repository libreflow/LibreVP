import { useEffect, useRef, useState } from 'react'
import type { MpvTrack } from '../../subtitles'

interface TrackMenuProps {
  label: string
  tracks: MpvTrack[]
  onSelect: (id: number) => void
  onDisable?: () => void
  disabledSelected: boolean
}

export function TrackMenu({ label, tracks, onSelect, onDisable, disabledSelected }: TrackMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  if (tracks.length === 0) return null

  return (
    <div className="track-menu" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn${open ? ' is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0 8a3 3 0 110-6 3 3 0 010 6zm0-13C7 2 2.7 5.6 1 10c1.7 4.4 6 8 11 8s9.3-3.6 11-8c-1.7-4.4-6-8-11-8zm0 14a9 9 0 01-8.9-7.5A9 9 0 0121 10.5 9 9 0 0112 16z" />
        </svg>
      </button>
      {open && (
        <div
          className="track-menu__panel"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="track-menu__title">{label}</div>
          {onDisable && (
            <button
              type="button"
              className={`track-menu__item${disabledSelected ? ' is-selected' : ''}`}
              onClick={() => {
                onDisable()
                setOpen(false)
              }}
            >
              Désactivées
            </button>
          )}
          {tracks.map((t) => (
            <button
              key={`${t.type}-${t.id}`}
              type="button"
              className={`track-menu__item${t.selected && !disabledSelected ? ' is-selected' : ''}`}
              onClick={() => {
                onSelect(t.id)
                setOpen(false)
              }}
            >
              {t.title ?? t.lang ?? `Piste ${t.id}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
