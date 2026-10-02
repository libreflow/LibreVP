export const MAX_VOLUME = 130

// Fraction of the window height mpv reserves at the bottom so the HTML
// control bar never overlaps the picture. Applied only while the controls
// are actually visible — see useControlsVisibility + the margin-sync effect
// in App.tsx. Keeping it fixed regardless of control visibility would centre
// the video in the wrong (permanently shrunk) region, producing uneven
// letterboxing once the controls auto-hide.
export const CONTROLS_MARGIN_RATIO = 0.1

export const VIDEO_EXTENSIONS = [
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'ts', 'mpg', 'mpeg',
]

export function formatTime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? m.toString().padStart(2, '0') : `${m}`
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS)

function hasVideoExtension(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return VIDEO_EXTENSION_SET.has(path.slice(dot + 1).toLowerCase())
}

// When several files are dropped at once, prefer the first one that looks
// like a video instead of blindly taking paths[0] (which may be a subtitle
// or artwork file dropped alongside the movie).
export function pickSupportedFile(paths: string[]): string | null {
  return paths.find((p) => hasVideoExtension(p)) ?? paths[0] ?? null
}
