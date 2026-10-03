import { describe, expect, it, vi } from 'vitest'

// Regression test: getTracks() used to call getProperty('track-list', 'node')
// to fetch the whole track list as one nested structure. On at least one
// real-world Windows setup (dual-GPU: Intel iGPU + Nvidia dGPU) this
// reliably segfaults inside the native libmpv-wrapper DLL
// (mpv_wrapper_get_property, an out-of-bounds array read decoding the
// node) for any file with several tracks -- reproduced consistently with
// a multi-track 4K HDR MKV (confirmed via a WinDbg crash dump: faulting
// instruction `movsxd rax, [rcx+rax*4]` with rax as a garbage index).
// This call happens unconditionally in onFileLoaded, so it crashed the
// whole app on every multi-track video, not just on a user action.
//
// Fix: read each sub-field (`track-list/N/<field>`) individually. Each is
// a scalar mpv property (string/int64/flag) that goes through a different,
// unaffected native code path. This test pins that contract: it fails
// loudly if `getProperty` is ever called with the 'node' format again.
const getPropertyMock = vi.hoisted(() =>
  vi.fn(async (name: string, format: string) => {
    if (format === 'node') {
      throw new Error(
        `getProperty('${name}', 'node') must never be called -- this format ` +
          'segfaults the native libmpv-wrapper DLL on real hardware (see ' +
          'the comment above this mock). Use indexed scalar sub-properties ' +
          '(track-list/N/<field>) instead.',
      )
    }
    const tracks = [
      { id: 1, type: 'video', title: undefined, lang: undefined, selected: true },
      { id: 2, type: 'audio', title: 'VFF', lang: 'fre', selected: true },
      { id: 3, type: 'audio', title: 'VO', lang: 'kor', selected: false },
      { id: 4, type: 'sub', title: undefined, lang: 'eng', selected: false },
    ] as const

    if (name === 'track-list/count') return tracks.length
    const m = /^track-list\/(\d+)\/(.+)$/.exec(name)
    if (!m) throw new Error(`unexpected property: ${name}`)
    const [, idxStr, field] = m
    const track = tracks[Number(idxStr)]
    if (!track) throw new Error(`index out of range: ${name}`)
    return (track as Record<string, unknown>)[field]
  }),
)

vi.mock('tauri-plugin-libmpv-api', () => ({
  getProperty: getPropertyMock,
  setProperty: vi.fn(async () => {}),
  command: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
}))

import { audioTracks, countSubtitleTracks, subtitleTracks } from './subtitles'

describe('subtitles track-list reading', () => {
  it('never queries track-list with the node format', async () => {
    await subtitleTracks()
    const nodeCalls = getPropertyMock.mock.calls.filter(([, format]) => format === 'node')
    expect(nodeCalls).toEqual([])
  })

  it('builds the audio track list from indexed scalar sub-properties', async () => {
    const tracks = await audioTracks()
    expect(tracks).toEqual([
      { id: 2, type: 'audio', title: 'VFF', lang: 'fre', selected: true },
      { id: 3, type: 'audio', title: 'VO', lang: 'kor', selected: false },
    ])
  })

  it('builds the subtitle track list, excluding the video track', async () => {
    const tracks = await subtitleTracks()
    expect(tracks).toEqual([
      { id: 4, type: 'sub', lang: 'eng', selected: false },
    ])
  })

  it('countSubtitleTracks reflects only sub-type tracks', async () => {
    expect(await countSubtitleTracks()).toBe(1)
  })

  it('propagates the error when track-list/count itself fails (mpv not ready) -- callers rely on this to report real errors instead of silently treating it as zero tracks', async () => {
    getPropertyMock.mockImplementationOnce(async () => {
      throw new Error('mpv not initialized: no active window')
    })
    await expect(subtitleTracks()).rejects.toThrow('mpv not initialized')
  })
})
