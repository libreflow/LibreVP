import { exists } from '@tauri-apps/plugin-fs'
import { command, getProperty, setProperty, type MpvFormat } from 'tauri-plugin-libmpv-api'

// Subtitle extensions mpv can load as external sidecar files.
export const SUBTITLE_EXTENSIONS = ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx']

function swapExtension(path: string, ext: string): string {
  const dot = path.lastIndexOf('.')
  const base = dot === -1 ? path : path.slice(0, dot)
  return `${base}.${ext}`
}

function splitPath(path: string): { dir: string; name: string } {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (slash === -1) return { dir: '', name: path }
  // Preserve a Windows drive prefix ("C:") when it directly abuts the name.
  if (slash === 1 && path[1] === ':') return { dir: path.slice(0, 2), name: path.slice(3) }
  return { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

function subtitleCandidates(videoPath: string): string[] {
  const sameExt = SUBTITLE_EXTENSIONS.map((ext) => swapExtension(videoPath, ext))
  const { dir, name } = splitPath(videoPath)
  const bare = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name
  // Also try "<bare>.<lang>.<ext>" patterns mpv would auto-discover.
  const langVariants = ['en', 'fr', 'eng', 'fre']
  return [
    ...sameExt,
    ...langVariants.flatMap((lang) =>
      SUBTITLE_EXTENSIONS.map((ext) => `${dir}${bare}.${lang}.${ext}`),
    ),
  ]
}

// mpv's `sub-auto` option handles same-directory discovery natively, but it
// requires exact name matching and doesn't report WHAT it found. For an
// explicit toggle we check whether a sidecar exists ourselves.
export async function findSidecarSubtitle(videoPath: string): Promise<string | null> {
  for (const candidate of subtitleCandidates(videoPath)) {
    if (await exists(candidate)) return candidate
  }
  return null
}

// A playable track as reported by mpv's track-list (embedded or sidecar).
export interface MpvTrack {
  id: number
  type: 'sub' | 'audio'
  title?: string
  lang?: string
  selected: boolean
}

// NOTE: getProperty(name, 'node') on 'track-list' is deliberately never
// used here. On at least one real-world setup it reliably segfaults inside
// the native libmpv-wrapper DLL (mpv_wrapper_get_property, out-of-bounds
// array read) when decoding the nested node structure for files with
// several tracks -- reproduced consistently with a multi-track 4K HDR MKV.
// Every sub-field below is a scalar mpv property (string/int64/flag), which
// goes through a different, unaffected native code path. One extra IPC
// round-trip per field is the price for not crashing the whole app.
async function getTrackField<T>(index: number, field: string, format: MpvFormat): Promise<T | undefined> {
  try {
    return await getProperty<T>(`track-list/${index}/${field}`, format)
  } catch {
    // Missing/inapplicable sub-field (e.g. no title) -- not a real error.
    return undefined
  }
}

async function getTracks(): Promise<MpvTrack[]> {
  // No try/catch here: propagate errors (e.g. mpv not ready yet) exactly
  // like the old `getProperty('track-list', 'node')` call did. Callers
  // already handle this at the right layer -- useSubtitles.refreshTracks
  // treats listing as best-effort (silent), while toggle() surfaces it via
  // onError. Swallowing it here would silently turn "mpv isn't ready" into
  // "this file has 0 tracks", which made toggle() wrongly no-op instead of
  // reporting the real error.
  const count = (await getProperty<number>('track-list/count', 'int64')) ?? 0
  const tracks: MpvTrack[] = []
  for (let i = 0; i < count; i++) {
    const type = await getTrackField<string>(i, 'type', 'string')
    if (type !== 'sub' && type !== 'audio') continue
    const id = await getTrackField<number>(i, 'id', 'int64')
    if (id === undefined) continue
    const title = await getTrackField<string>(i, 'title', 'string')
    const lang = await getTrackField<string>(i, 'lang', 'string')
    const selected = await getTrackField<boolean>(i, 'selected', 'flag')
    tracks.push({
      id,
      type,
      ...(title !== undefined && { title }),
      ...(lang !== undefined && { lang }),
      selected: selected === true,
    })
  }
  return tracks
}

export async function subtitleTracks(): Promise<MpvTrack[]> {
  return (await getTracks()).filter((t) => t.type === 'sub')
}

export async function audioTracks(): Promise<MpvTrack[]> {
  return (await getTracks()).filter((t) => t.type === 'audio')
}

// Counts the container's embedded subtitle tracks via mpv's track-list.
// track-list/count can't be used here: it totals video + audio + sub tracks
// and is therefore non-zero for every playable file.
export async function countSubtitleTracks(): Promise<number> {
  return (await subtitleTracks()).length
}

export async function setSubtitleTrack(id: number | 'no'): Promise<void> {
  await setProperty('sid', id)
}

export async function setAudioTrack(id: number): Promise<void> {
  await setProperty('aid', id)
}

export async function isSubtitleVisible(): Promise<boolean> {
  return (await getProperty('sub-visibility', 'flag')) ?? false
}

export async function setSubtitleVisible(visible: boolean): Promise<void> {
  await setProperty('sub-visibility', visible)
}

export async function loadSubtitle(path: string): Promise<void> {
  await command('sub-add', [path, 'auto'])
}
