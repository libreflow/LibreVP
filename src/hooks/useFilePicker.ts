import { useEffect, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { hasVideoExtension, pickSupportedFile, VIDEO_EXTENSIONS } from '../utils'

// File picking via the native dialog + acceptance of files dropped onto the
// window (native OS drag-drop, not the HTML5 DnD API — mpv's video surface
// sits behind the webview and would otherwise swallow the drop before any
// HTML listener sees it).
export function useFilePicker(opts: {
  readyRef: React.MutableRefObject<boolean>
  loadFile: (path: string) => Promise<void>
  onFilesDropped?: (paths: string[]) => void
  onFilePicked?: (path: string) => void
  onError: (msg: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const openFile = async () => {
    try {
      const path = await openFileDialog({
        title: 'Ouvrir une vidéo',
        multiple: false,
        filters: [{ name: 'Vidéo', extensions: VIDEO_EXTENSIONS }],
      })
      if (!path || Array.isArray(path)) return
      // Route through the queue like drag-drop does, so the picked file
      // gets prev/next navigation too instead of playing "outside".
      if (opts.onFilePicked) {
        opts.onFilePicked(path)
      } else {
        await opts.loadFile(path)
      }
    } catch (e) {
      opts.onError(`Impossible d'ouvrir le sélecteur de fichier : ${String(e)}`)
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'enter') setIsDragOver(true)
        if (event.payload.type === 'leave') setIsDragOver(false)
        if (event.payload.type === 'drop') {
          setIsDragOver(false)
          const paths = event.payload.paths
          // Keep only actual video files: a subtitle or artwork file
          // dropped alongside the movie must not enter the playback queue.
          const videos = paths.filter(hasVideoExtension)
          if (videos.length === 0) return
          if (opts.onFilesDropped) {
            opts.onFilesDropped(videos)
          } else {
            const path = pickSupportedFile(paths)
            if (path && opts.readyRef.current) void opts.loadFile(path)
          }
        }
      })
    })()
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable: loadFile is memoized with [] deps
  }, [opts.loadFile])

  return { isDragOver, openFile }
}
