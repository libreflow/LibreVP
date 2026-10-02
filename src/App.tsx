import { useCallback, useState } from 'react'
import { command } from 'tauri-plugin-libmpv-api'
import { usePlayer } from './hooks/usePlayer'
import { useKeyboardShortcuts, useFullscreen, useControlsVisibility } from './hooks/useShortcuts'
import { useFilePicker } from './hooks/useFilePicker'
import { useFileAssociation } from './hooks/useFileAssociation'
import { Controls } from './components/Controls'
import './App.css'

function App() {
  const { showControls, onPointerActivity } = useControlsVisibility()
  const player = usePlayer(showControls)
  const [error, setError] = useState<string | null>(null)

  const onError = useCallback((msg: string) => setError(msg), [])
  const { isFullscreen, toggleFullscreen } = useFullscreen(onError)
  const { isDragOver, openFile } = useFilePicker({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onError,
  })
  useFileAssociation({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onError,
  })

  const hasMedia = player.filename != null

  useKeyboardShortcuts({
    hasMedia,
    volume: player.volume,
    isFullscreen,
    togglePause: player.togglePause,
    toggleFullscreen,
  })

  const onSeekCommit = useCallback((t: number) => {
    void command('seek', [t, 'absolute']).finally(() => {
      player.seekingRef.current = false
    })
  }, [player.seekingRef])

  const errorToDisplay = error ?? player.error

  return (
    <div
      className={`player${hasMedia ? ' has-media' : ''}${showControls ? ' show-controls' : ''}${isDragOver ? ' drag-over' : ''}`}
      onMouseMove={onPointerActivity}
      onClick={hasMedia ? player.togglePause : undefined}
      onDoubleClick={hasMedia ? toggleFullscreen : undefined}
    >
      {errorToDisplay && <div className="error-banner error-banner--overlay">{errorToDisplay}</div>}
      {isDragOver && (
        <div className="drag-overlay">Déposer la vidéo pour la lire</div>
      )}

      {!hasMedia && (
        <div className="drop-zone">
          <div className="drop-zone__title">LibreVP</div>
          <button
            type="button"
            className="open-btn"
            disabled={!player.ready}
            onClick={(e) => {
              e.stopPropagation()
              void openFile()
            }}
          >
            {player.ready ? 'Ouvrir une vidéo…' : 'Initialisation du lecteur…'}
          </button>
        </div>
      )}

      <Controls
        paused={player.paused}
        volume={player.volume}
        filename={player.filename}
        isFullscreen={isFullscreen}
        togglePause={player.togglePause}
        toggleFullscreen={toggleFullscreen}
        setVolume={player.setVolume}
        onOpenFile={() => void openFile()}
        onSeekChange={player.setTimePos}
        onSeekCommit={onSeekCommit}
        seekingRef={player.seekingRef}
        timePos={player.timePos}
        duration={player.duration}
      />
    </div>
  )
}

export default App
