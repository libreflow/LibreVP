import { useCallback, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getResumePosition, saveResumePosition } from '../resume'

// How often to persist the resume position while playing (seconds of
// wall-clock time between writes). A crash/power loss between two
// checkpoints loses at most this much progress -- cheap tradeoff against
// writing to disk on every time-pos tick (several times a second).
const RESUME_SAVE_INTERVAL_MS = 5000

export interface ResumeTrackState {
  /** Full path of the currently loaded file (resume-map key). */
  path: string | null
  timePos: number | null
  duration: number | null
}

// Persists the playback position of the current file so re-opening it
// resumes where the user left off. All writes are checkpoint-based:
// on pause, every RESUME_SAVE_INTERVAL_MS while playing, on file switch
// (previous file), and on window close (awaited).
//
// The hook is deliberately push-driven: usePlayer feeds it the current
// path/position/duration through track() (called from mpv's property
// observer) and calls checkpoint() at the moments that matter.
export function useResumePosition(ready: boolean) {
  const stateRef = useRef<ResumeTrackState>({ path: null, timePos: null, duration: null })

  const track = useCallback((next: Partial<ResumeTrackState>) => {
    Object.assign(stateRef.current, next)
  }, [])

  const checkpoint = useCallback(async () => {
    const { path, timePos, duration } = stateRef.current
    if (!path || timePos == null) return
    await saveResumePosition(path, timePos, duration ?? 0)
  }, [])

  // Reset tracking state when a new file is loaded.
  const onFileChange = useCallback((path: string) => {
    void checkpoint().then(() => {
      stateRef.current = { path, timePos: null, duration: null }
    })
  }, [checkpoint])

  // Returns the remembered position for this path, or null.
  const resumeAt = useCallback((path: string) => getResumePosition(path), [])

  // Periodic checkpoint while playing, so a crash or power loss between
  // pauses loses at most RESUME_SAVE_INTERVAL_MS of progress.
  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => void checkpoint(), RESUME_SAVE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ready, checkpoint])

  // Also checkpoint when the window is about to close -- the periodic timer
  // alone could miss up to RESUME_SAVE_INTERVAL_MS of progress right before
  // a clean quit. Await the save (not fire-and-forget): onCloseRequested's
  // wrapper awaits this handler before letting the window actually close,
  // so a bare `void checkpoint()` would race the write against process
  // exit and could lose it.
  useEffect(() => {
    if (!ready) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWindow().onCloseRequested(async () => {
        await checkpoint()
      })
    })()
    return () => unlisten?.()
  }, [ready, checkpoint])

  return { track, checkpoint, onFileChange, resumeAt }
}
