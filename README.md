# Luma Well

A dependency-free browser port of ToolLab's Luma Well game. Capture compatible
orbiting matter, merge it into the central planet, and continue growing through
an endless sequence of stages.

## Play online
https://renierr.github.io/luma-game/

## Run locally

Serve this folder with any static web server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The game is also ready for static hosting on
GitHub Pages: its paths are relative and it includes a web app manifest and
service worker.

## Project files

- `index.html`: game shell and controls.
- `js/game.js`: game simulation, canvas rendering, input, persistence, and audio.
- `style.css`: responsive game and modal UI.
- `help.html`: standalone illustrated gameplay reference.
- `manifest.webmanifest` and `sw.js`: installable/offline PWA support.

Run state, settings, and the best score are stored locally in the browser.
