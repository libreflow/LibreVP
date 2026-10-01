import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { command, setProperty } from 'tauri-plugin-libmpv-api'
import { MAX_VOLUME } from '../utils'

// Global keyboard shortcuts. Read current state via refs rather than
// re-binding the listener on every state change (avoids churn and keeps
// a single, stable keydown handler for the window's lifetime).
export function useKeyboardShortcuts(opts: {
  hasMedia: boolean
  volume: number
  isFullscreen: boolean
  togglePause: () => void
  toggleFullscreen: () => void
}) {
  const hasMediaRef = useRef(false)
  hasMediaRef.current = opts.hasMedia

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
          if (hasMediaRef.current) opts.togglePause()
          break
        case 'f':
          e.preventDefault()
          opts.toggleFullscreen()
          break
        case 'Escape':
          if (opts.isFullscreen) opts.toggleFullscreen()
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
          void setProperty('volume', Math.min(MAX_VOLUME, opts.volume + 5))
          break
        case 'ArrowDown':
          e.preventDefault()
          void setProperty('volume', Math.max(0, opts.volume - 5))
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refs carry fresh values, volume/isFullscreen rebind only when they truly change
  }, [opts.isFullscreen, opts.volume, opts.toggleFullscreen, opts.togglePause])
}

export function useFullscreen(onError: (msg: string) => void) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => {
    const win = getCurrentWindow()
    void win.isFullscreen().then((fs) => {
      void win.setFullscreen(!fs).catch((e) => onError(`Plein écran indisponible : ${String(e)}`))
      setIsFullscreen(!fs)
    })
  }, [onError])
  return { isFullscreen, toggleFullscreen }
}

export function useControlsVisibility() {
  const [showControls, setShowControls] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return { showControls, onPointerActivity }
}
