import { exists } from '@tauri-apps/plugin-fs'
import { command, getProperty, setProperty } from 'tauri-plugin-libmpv-api'

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

function asTrackList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (t): t is Record<string, unknown> => typeof t === 'object' && t !== null,
  )
}

async function getTracks(): Promise<MpvTrack[]> {
  const raw = await getProperty('track-list', 'node')
  return asTrackList(raw)
    .filter((t) => t.type === 'sub' || t.type === 'audio')
    .map((t) => ({
      id: Number(t.id),
      type: t.type as 'sub' | 'audio',
      ...(typeof t.title === 'string' && { title: t.title }),
      ...(typeof t.lang === 'string' && { lang: t.lang }),
      selected: t.selected === true,
    }))
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
