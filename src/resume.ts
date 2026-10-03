import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const RESUME_FILE_NAME = 'resume.json'

// Below this many seconds from the start, resuming is pointless -- just
// start from 0 like a fresh play.
const MIN_RESUMABLE_SECONDS = 5

// Above this fraction of the duration, treat the file as "finished" rather
// than resumable (avoids re-seeking to 99% and immediately hitting EOF).
const FINISHED_THRESHOLD = 0.97

interface ResumeEntry {
  position: number
  duration: number
  updatedAt: number
  /** Selected subtitle track id at exit ('no' = forced off), if any. */
  sid?: string
  /** Selected audio track id at exit, if any. */
  aid?: string
}

type ResumeMap = Record<string, ResumeEntry>

let cachedPath: string | null = null

async function resumeFilePath(): Promise<string> {
  if (cachedPath) return cachedPath
  const dir = await appConfigDir()
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  cachedPath = await join(dir, RESUME_FILE_NAME)
  return cachedPath
}

async function readResumeMap(): Promise<ResumeMap> {
  try {
    const path = await resumeFilePath()
    if (!(await exists(path))) return {}
    const raw = await readTextFile(path)
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as ResumeMap) : {}
  } catch {
    // Corrupt/unreadable file is a normal, expected case (manual edit,
    // partial write from a crash) -- treat as "nothing remembered" rather
    // than surfacing an error to the user.
    return {}
  }
}

async function writeResumeMap(map: ResumeMap): Promise<void> {
  const path = await resumeFilePath()
  await writeTextFile(path, JSON.stringify(map))
}

// Drops entries whose file no longer exists on disk, so the map doesn't
// grow forever with positions of deleted/moved videos. Best-effort: an
// exists() that throws (e.g. unreadable directory) keeps the entry.
async function prunedMap(map: ResumeMap): Promise<ResumeMap> {
  const entries = await Promise.all(
    Object.entries(map).map(async ([filePath, entry]) => {
      let fileExists = true
      try {
        fileExists = await exists(filePath)
      } catch {
        fileExists = true
      }
      return fileExists ? [filePath, entry] : null
    }),
  )
  return Object.fromEntries(entries.filter((e): e is [string, ResumeEntry] => e !== null))
}

// Returns the remembered position for this file, or null if there is
// nothing resumable (never played, too close to the start, or already
// finished).
export async function getResumeTracks(filePath: string): Promise<{ sid?: string; aid?: string } | null> {
  const map = await readResumeMap()
  const entry = map[filePath]
  if (!entry) return null
  return { sid: entry.sid, aid: entry.aid }
}

export async function getResumePosition(filePath: string): Promise<number | null> {
  const map = await readResumeMap()
  const entry = map[filePath]
  if (!entry) return null
  if (entry.position < MIN_RESUMABLE_SECONDS) return null
  if (entry.duration > 0 && entry.position / entry.duration >= FINISHED_THRESHOLD) return null
  return entry.position
}

// Best-effort save -- never throws into the caller. Losing a resume point
// is a minor inconvenience, not a reason to interrupt playback or surface
// an error banner.
export async function saveResumePosition(
  filePath: string,
  position: number,
  duration: number,
  tracks?: { sid?: string; aid?: string },
): Promise<void> {
  try {
    const map = await readResumeMap()
    if (position < MIN_RESUMABLE_SECONDS || (duration > 0 && position / duration >= FINISHED_THRESHOLD)) {
      // Clean up a stale entry once the file has been watched to the end,
      // so re-opening it later starts fresh instead of re-seeking to 100%.
      if (map[filePath]) {
        delete map[filePath]
        await writeResumeMap(map)
      }
      return
    }
    map[filePath] = {
      position,
      duration,
      updatedAt: Date.now(),
      ...(tracks?.sid != null && { sid: tracks.sid }),
      ...(tracks?.aid != null && { aid: tracks.aid }),
    }
    await writeResumeMap(await prunedMap(map))
  } catch {
    // Disk full, permission error, etc. -- silently skip, see above.
  }
}
