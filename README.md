# LibreVP

Lecteur vidéo de bureau (Tauri + React/TypeScript), moteur [mpv](https://mpv.io/)
embarqué via [`tauri-plugin-libmpv`](https://github.com/nini22P/tauri-plugin-libmpv)
— lit nativement à peu près tout ce que mpv lit (HEVC/x265, HDR, MKV, AV1, ...),
contrairement à un simple `<video>` HTML limité aux codecs de la WebView.

## Setup (après clone)

```bash
npm install
npx tauri-plugin-libmpv-api setup-lib   # télécharge libmpv-2.dll + le wrapper dans src-tauri/lib/
npm run tauri build -- --debug          # ou: npm run tauri dev
```

Les DLL natives (`src-tauri/lib/`) ne sont pas versionnées (trop lourdes,
~100 Mo) — `setup-lib` les retélécharge à chaque nouveau clone.

## Stack

- Frontend : React 19 + TypeScript, Vite 8
- Backend : Tauri 2, `tauri-plugin-libmpv` (lecture vidéo), `tauri-plugin-dialog`
  (sélection de fichier)
- La fenêtre est transparente ; mpv compose sa surface vidéo nativement
  derrière la WebView, les contrôles HTML flottent par-dessus en overlay.

## Développement

Template de base : React + TypeScript + Vite (voir
[vite.dev](https://vite.dev) pour les options HMR/lint génériques).
