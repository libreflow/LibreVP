import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { command } from 'tauri-plugin-libmpv-api'

export interface PlaylistItem {
  path: string
  name: string
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

// Playback queue. Files are appended (multi-file drag-drop, file dialog),
// navigated with next/previous (buttons, `n`/`p` keys), and playback
// auto-advances when mpv reports the current file ended (EOF).
//
// `loadFile` must be the player's single-file loader: it resets resume
// tracking and reads back the real pause state, so reusing it for
// navigation keeps all of that behavior consistent.
export function usePlaylist(opts: {
  ready: boolean
  loadFile: (path: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [queue, setQueue] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [panelOpen, setPanelOpen] = useState(false)

  // Refs mirroring state so the once-attached end-file listener sees fresh
  // values without re-subscribing on every queue change.
  const queueRef = useRef<PlaylistItem[]>([])
  const indexRef = useRef(-1)
  queueRef.current = queue
  indexRef.current = currentIndex

  // loadFile is stable (memoized with [resume] in usePlayer), but mirroring
  // it in a ref keeps playIndex itself identity-stable so the end-file
  // listener below never re-subscribes.
  const loadFileRef = useRef(opts.loadFile)
  loadFileRef.current = opts.loadFile

  const playIndex = useCallback(
    async (index: number) => {
      const item = queueRef.current[index]
      if (!item) return
      // Only commit the index once the file actually loads -- a corrupt
      // file used to leave the queue pointing at an unplayable "ghost"
      // item, breaking prev/next navigation and EOF auto-advance.
      await loadFileRef.current(item.path)
      if (queueRef.current[index] === item) setCurrentIndex(index)
    },
    [],
  )

  // Append files to the queue. When the queue was empty, the first file is
  // played immediately (standard player behavior).
  const append = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return
      const items = paths.map((p) => ({ path: p, name: basename(p) }))
      const wasEmpty = queueRef.current.length === 0
      queueRef.current = [...queueRef.current, ...items]
      setQueue(queueRef.current)
      if (wasEmpty) void playIndex(0)
    },
    [playIndex],
  )

  const playNext = useCallback(() => {
    const next = indexRef.current + 1
    if (next < queueRef.current.length) void playIndex(next)
  }, [playIndex])

  const playPrevious = useCallback(() => {
    if (indexRef.current > 0) void playIndex(indexRef.current - 1)
  }, [playIndex])

  const removeAt = useCallback((index: number) => {
    const next = queueRef.current.filter((_, i) => i !== index)
    queueRef.current = next
    setQueue(next)
    if (index < indexRef.current) setCurrentIndex((c) => c - 1)
    else if (index === indexRef.current) setCurrentIndex(-1)
  }, [])

  const clear = useCallback(() => {
    queueRef.current = []
    indexRef.current = -1
    setQueue([])
    setCurrentIndex(-1)
  }, [])

  // Auto-advance when the current file reaches EOF. tauri-plugin-libmpv
  // re-emits mpv's end-file reason as a Tauri event; only advance on a
  // natural end (reason 'eof'), not on an error or a manual loadfile
  // switch (those set reason 'redirect'/'stop' and are user-driven anyway).
  useEffect(() => {
    if (!opts.ready) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        unlisten = await listen<{ reason?: string }>('end-file', (event) => {
          if (event.payload?.reason === 'eof') playNext()
        })
      } catch (e) {
        if (!cancelled) opts.onError(`File d'attente indisponible : ${String(e)}`)
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: playNext reads refs and is stable
  }, [opts.ready, playNext])

  // Keep mpv's keep-open consistent with queue presence: with a queue,
  // auto-advance handles EOF so keep-open must not pause at the end.
  useEffect(() => {
    if (!opts.ready) return
    void command('set_property', ['keep-open', queue.length > 1 ? 'no' : 'always'])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: queue length only
  }, [opts.ready, queue.length])

  return {
    queue,
    currentIndex,
    panelOpen,
    setPanelOpen,
    append,
    playIndex,
    playNext,
    playPrevious,
    removeAt,
    clear,
  }
}
