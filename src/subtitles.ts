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

export async function isSubtitleVisible(): Promise<boolean> {
  return (await getProperty('sub-visibility', 'flag')) ?? false
}

export async function setSubtitleVisible(visible: boolean): Promise<void> {
  await setProperty('sub-visibility', visible)
}

export async function loadSubtitle(path: string): Promise<void> {
  await command('sub-add', [path, 'auto'])
}
