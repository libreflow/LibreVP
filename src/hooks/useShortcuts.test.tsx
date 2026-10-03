import { act, render } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useShortcuts'

// Regression test for a stale-closure bug: useKeyboardShortcuts used to
// depend on [isFullscreen, volume, toggleFullscreen, togglePause] only.
// toggleMotion/togglePlaylist are plain inline arrows recreated on every
// App render (not useCallback-memoized), so the keydown listener captured
// whichever closure existed at the last re-subscribe -- in practice the
// very first render, since togglePause/toggleFullscreen stay referentially
// stable. Pressing 'm' or 'l' a second time called a STALE closure that
// still read the original state and always recomputed the same result,
// so the shortcut visibly worked once then appeared frozen.
function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

// Mirrors the real reference-stability shape from App.tsx: togglePause and
// toggleFullscreen are useCallback-stabilized; toggleMotion/togglePlaylist
// are freshly-created arrows closing over local state, exactly like
// `() => void motion.toggle()` and `() => playlist.setPanelOpen(!playlist.panelOpen)`.
function Harness({ onSnapshot }: { onSnapshot: (s: { enabled: boolean; panelOpen: boolean }) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const stableTogglePause = useCallback(() => {}, [])
  const stableToggleFullscreen = useCallback(() => {}, [])
  // Exact replica of useMotionInterpolation's `toggle`: useCallback closing
  // over `enabled`, deps=[enabled] (not an updater function).
  const motionToggle = useCallback(() => setEnabled(!enabled), [enabled])

  useKeyboardShortcuts({
    hasMedia: true,
    volume: 100,
    isFullscreen: false,
    togglePause: stableTogglePause,
    toggleFullscreen: stableToggleFullscreen,
    toggleSubtitles: () => {},
    toggleMotion: () => motionToggle(),
    playNext: () => {},
    playPrevious: () => {},
    togglePlaylist: () => setPanelOpen(!panelOpen),
  })

  onSnapshot({ enabled, panelOpen })
  return null
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('toggles motion ("m") repeatedly, not just once, when togglePause/toggleFullscreen stay stable', () => {
    const snapshots: { enabled: boolean; panelOpen: boolean }[] = []
    render(<Harness onSnapshot={(s) => snapshots.push(s)} />)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(true)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(false)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(true)
  })

  it('toggles the playlist panel ("l") repeatedly, not just once', () => {
    const snapshots: { enabled: boolean; panelOpen: boolean }[] = []
    render(<Harness onSnapshot={(s) => snapshots.push(s)} />)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(true)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(false)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(true)
  })

  it('still respects hasMedia=false by not calling togglePause on space/k', () => {
    const togglePause = vi.fn()
    function NoMediaHarness() {
      useKeyboardShortcuts({
        hasMedia: false,
        volume: 100,
        isFullscreen: false,
        togglePause,
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
        toggleMotion: () => {},
        playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
      })
      return null
    }
    render(<NoMediaHarness />)
    act(() => press('k'))
    expect(togglePause).not.toHaveBeenCalled()
  })
})
