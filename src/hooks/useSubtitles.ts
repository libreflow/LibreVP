import { useCallback, useEffect, useRef, useState } from 'react'
import { getProperty } from 'tauri-plugin-libmpv-api'
import {
  findSidecarSubtitle,
  isSubtitleVisible,
  loadSubtitle,
  setSubtitleVisible,
} from '../subtitles'

// Auto-loads a sidecar subtitle file (same name as the video, or with a
// common language tag) when a file is opened, and exposes a visible/hidden
// toggle. If no sidecar exists, the toggle is a no-op (embedded tracks are
// left to mpv's own defaults).
export function useSubtitles() {
  const [available, setAvailable] = useState(false)
  const [visible, setVisible] = useState(false)
  // The video path whose sidecar is currently loaded, so we don't re-add
  // the same sub track when the user merely toggles visibility.
  const loadedForRef = useRef<string | null>(null)

  const onFileLoaded = useCallback(async (videoPath: string) => {
    try {
      const sidecar = await findSidecarSubtitle(videoPath)
      if (loadedForRef.current !== videoPath) {
        loadedForRef.current = videoPath
        if (sidecar) {
          setAvailable(true)
          await loadSubtitle(sidecar)
          await setSubtitleVisible(true)
          setVisible(true)
        } else {
          // No sidecar, but the container may embed sub tracks (MKV, MP4...).
          // Ask mpv for the real track count instead of reporting "none".
          const trackCount = await getProperty('track-list/count', 'int64')
          const hasSubs = trackCount != null && trackCount > 0
          setAvailable(hasSubs)
          setVisible(hasSubs ? await isSubtitleVisible() : false)
        }
      }
    } catch {
      // Subtitle discovery is best-effort; never block playback on it.
      setAvailable(false)
      setVisible(false)
      loadedForRef.current = videoPath
    }
  }, [])

  const toggle = useCallback(async () => {
    try {
      // Prefer mpv's real state: if an embedded track is active, toggling
      // visibility applies to it too, not just our sidecar.
      const current = await isSubtitleVisible()
      const next = !current
      await setSubtitleVisible(next)
      setVisible(next)
      setAvailable(true)
    } catch {
      // No sub track at all -- nothing to toggle.
    }
  }, [])

  // Reset when the app starts (no file loaded yet).
  useEffect(() => () => {
    loadedForRef.current = null
  }, [])

  return { available, visible, onFileLoaded, toggle }
}
