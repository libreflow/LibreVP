# Libre Media Player

Lecteur vidéo de bureau **libre et gratuit**, moteur [mpv](https://mpv.io/)
embarqué via [`tauri-plugin-libmpv`](https://github.com/nini22P/tauri-plugin-libmpv)
— lit nativement à peu près tout ce que mpv lit (HEVC/x265, HDR, MKV, AV1, ...),
contrairement à un simple `<video>` HTML limité aux codecs de la WebView.

## Philosophie

- **Libre** : le code est ouvert (MIT), sans télémétrie, sans compte, sans
  publicité, sans obligation quelconque — vos vidéos restent chez vous.
- **Simple** : on ouvre, on regarde, c'est tout. Pas d'écran d'accueil, pas de
  bibliothèque à indexer, pas de modes « premium ».
- **Capable** : quand mpv est là, le format est lu — point. Le player
  s'efforce de « juste marcher » plutôt que d'exposer chaque réglage.
- **Léger** : pas de dépendances exotiques, pas de service en arrière-plan ;
  l'app se ferme quand on la ferme.

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

## Association de fichiers Windows (« ouvrir avec Libre Media Player par défaut »)

Libre Media Player s'enregistre comme candidat valide pour
.mp4/.mkv/.avi/.mov/.webm/.m4v/.flv/.wmv/.ts/.mpg/.mpeg, via deux mécanismes
complémentaires (voir `src-tauri/windows/hooks.nsh` pour le détail et les
raisons) :

- `bundle.fileAssociations` (tauri.conf.json) — déclare les extensions,
  Tauri écrit l'association « legacy » par extension (`HKCU\...\Classes\<ext>`).
- Un hook NSIS custom (`installerHooks`) ajoute en plus l'enregistrement
  « Default Programs » de Windows (`RegisteredApplications` +
  `Software\Clients\Media\Libre Media Player\Capabilities`) — SANS lui, l'app
  n'apparaît même pas comme choix proposé dans Paramètres > Applications par
  défaut (vérifié : Tauri seul ne couvre pas cette couche sur NSIS).

**Limitation Windows (pas un bug Libre Media Player)** : depuis Windows 10, aucune
application ne peut définir par programmation l'application par défaut
d'un type de fichier (protégé par un hash anti-malware côté OS, voir
Microsoft Learn « Default apps platform »). L'installateur rend donc Libre Media Player
*sélectionnable*, mais l'utilisateur doit confirmer lui-même le choix via
Paramètres Windows > Applications > Applications par défaut (ou le menu
« Ouvrir avec » de l'Explorateur) — aucun installateur, VLC compris, ne peut
faire autrement.

## Développement

Template de base : React + TypeScript + Vite (voir
[vite.dev](https://vite.dev) pour les options HMR/lint génériques).
