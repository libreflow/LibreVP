; Registers LibreVP with Windows' "Default Programs" system, the mechanism
; actually consulted by Settings > Default Apps (and the per-extension
; picker) to decide which apps are OFFERABLE as a default -- separate from,
; and not covered by, Tauri's bundle.fileAssociations (that only writes the
; legacy per-extension ProgId under HKCU\...\Classes\<ext>, which existing
; UserChoice entries simply ignore, AND doesn't make the app appear as a
; selectable candidate at all; confirmed by testing against the real
; installed app -- Settings' file-type picker showed only the existing VLC
; association with no LibreVP option until these keys were added).
;
; Reference: Microsoft's "Default Programs" registration contract
; (RegisteredApplications + a Capabilities key), see
; https://learn.microsoft.com/windows/win32/shell/default-programs
;
; Intentionally omits DefaultIcon/supportedTypes per-extension sub-detail --
; the goal is "appears as a valid candidate app", not a full polished
; Capabilities block; can be extended later if needed.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities" "ApplicationName" "LibreVP"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities" "ApplicationDescription" "Lecteur vidéo LibreVP"
  ; ProgIds below MUST match what bundle.fileAssociations[].name produces in
  ; tauri.conf.json (Tauri uses that name verbatim as the ProgId -- see the
  ; matching comment there). Keep the two in sync by hand if either changes;
  ; a mismatch here silently points Default Programs at a ProgId that
  ; doesn't exist, so the "open with" command would do nothing.
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".mp4" "Vidéo MP4 QuickTime"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".m4v" "Vidéo MP4 QuickTime"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".mov" "Vidéo MP4 QuickTime"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".mkv" "Vidéo Matroska WebM"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".webm" "Vidéo Matroska WebM"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".avi" "Vidéo AVI"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".flv" "Vidéo"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".wmv" "Vidéo"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".ts" "Vidéo"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".mpg" "Vidéo"
  WriteRegStr SHCTX "Software\Clients\Media\LibreVP\Capabilities\FileAssociations" ".mpeg" "Vidéo"
  WriteRegStr SHCTX "Software\RegisteredApplications" "LibreVP" "Software\Clients\Media\LibreVP\Capabilities"

  ; App Paths lets Windows resolve "librevp.exe" by bare name (Run dialog,
  ; "where" from other installers/scripts) -- cheap to add alongside the
  ; Default Programs registration above, same install step.
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\librevp.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\librevp.exe" "Path" "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey SHCTX "Software\Clients\Media\LibreVP"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "LibreVP"
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\librevp.exe"
!macroend
