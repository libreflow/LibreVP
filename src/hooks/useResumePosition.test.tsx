import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useResumePosition } from './useResumePosition'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async () => () => {}),
  })),
}))
vi.mock('../resume', () => ({
  getResumePosition: vi.fn(async () => null),
  saveResumePosition: vi.fn(async () => {}),
}))

// Regression test: useResumePosition's returned object used to be a fresh
// object literal on every render (only its individual properties were
// memoized), which silently defeated usePlayer's own
// `useCallback(loadFile, [resume])` -- loadFile changed identity on every
// mpv time-pos tick (several times a second during playback), which in
// turn churned every effect depending on it (e.g. useFilePicker's native
// drag-drop subscription re-subscribing mid-playback).
describe('useResumePosition', () => {
  it('returns a referentially stable object across re-renders with the same `ready` value', () => {
    const { result, rerender } = renderHook(({ ready }) => useResumePosition(ready), {
      initialProps: { ready: true },
    })
    const first = result.current
    rerender({ ready: true })
    const second = result.current
    expect(second).toBe(first)
    rerender({ ready: true })
    expect(result.current).toBe(first)
  })

  it('each returned callback is independently stable across re-renders', () => {
    const { result, rerender } = renderHook(({ ready }) => useResumePosition(ready), {
      initialProps: { ready: true },
    })
    const first = result.current
    rerender({ ready: true })
    expect(result.current.track).toBe(first.track)
    expect(result.current.checkpoint).toBe(first.checkpoint)
    expect(result.current.onFileChangeOutgoing).toBe(first.onFileChangeOutgoing)
    expect(result.current.onFileChangeIncoming).toBe(first.onFileChangeIncoming)
    expect(result.current.resumeAt).toBe(first.resumeAt)
  })
})
