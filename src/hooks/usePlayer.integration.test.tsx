import { describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

// Full mock of the mpv plugin surface usePlayer depends on.
let propertyListener: ((event: { name: string; data: unknown }) => void) | null = null
vi.mock('tauri-plugin-libmpv-api', () => ({
  init: vi.fn(async () => 'main'),
  destroy: vi.fn(async () => {}),
  observeProperties: vi.fn(async (_props: unknown, cb: (e: { name: string; data: unknown }) => void) => {
    propertyListener = cb
    return () => { propertyListener = null }
  }),
  command: vi.fn(async () => {}),
  setProperty: vi.fn(async () => {}),
  getProperty: vi.fn(async () => true),
  setVideoMarginRatio: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => '{}'),
  writeTextFile: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async () => () => {}),
  })),
}))

let dragDropSubscribeCount = 0
const unlistenSpy = vi.fn()
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async () => {
      dragDropSubscribeCount++
      return unlistenSpy
    }),
  }),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

import { usePlayer } from './usePlayer'
import { useFilePicker } from './useFilePicker'

// Exact wiring from App.tsx: useFilePicker receives player.loadFile.
function Harness() {
  const player = usePlayer(true)
  useFilePicker({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onError: () => {},
  })
  return null
}

// Regression/integration test for the loadFile-identity-churn bug: before
// useResumePosition's return value was memoized, each ordinary mpv
// time-pos tick (several times a second during real playback) gave
// usePlayer's loadFile a NEW identity, which silently re-triggered every
// effect depending on it -- including useFilePicker's native drag-drop
// subscription, which tore down and rebuilt its OS-level listener on every
// tick instead of once per mount.
describe('usePlayer + useFilePicker integration: loadFile identity stability', () => {
  it('does not re-subscribe the native drag-drop listener on ordinary playback ticks', async () => {
    render(<Harness />)
    await waitFor(() => expect(propertyListener).not.toBeNull())
    await waitFor(() => expect(dragDropSubscribeCount).toBeGreaterThan(0))

    const afterMount = dragDropSubscribeCount

    // Simulate 5 ordinary mpv time-pos ticks (happens multiple times/sec
    // during real playback).
    for (let i = 0; i < 5; i++) {
      act(() => {
        propertyListener!({ name: 'time-pos', data: 10 + i })
      })
    }

    expect(dragDropSubscribeCount).toBe(afterMount)
    expect(unlistenSpy).not.toHaveBeenCalled()
  })
})
