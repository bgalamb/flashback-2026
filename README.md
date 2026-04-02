# flashback-web

This repository contains the web/TypeScript version of *Flashback*, along with the game data, build scripts, and debugging/export helpers used to inspect and regenerate runtime assets.

## Quick Start

Install dependencies if needed, then use the common scripts from the repository root:

```bash
npm run dev
npm run build
npm run check
```

## Recording Input For Tests

While the game is running in the browser, you can capture keyboard input and turn it into a replay fixture:

```js
window.__flashbackInputRecording.start()
window.__flashbackInputRecording.stop()
window.__flashbackInputRecording.get()
```

Typical flow:

- start recording in the browser console before you begin playing
- play through the sequence you want to preserve
- call `window.__flashbackInputRecording.stop()` and copy the returned JSON into `test/fixtures/` without renaming it
- replay that fixture from a Node test with `replayInputRecording()`

New recordings now include:

- `events`: the recorded key presses/releases

The smoke test runner automatically turns every `flashback-input-recording-*.json` fixture in `test/fixtures/` into its own replay and smoke test.

## Project Areas

- `src/` contains the TypeScript runtime, gameplay logic, and helper tooling.
- `DATA/` contains level data, generated runtime assets, and legacy source assets used by exporters/rebuilders.
- `dist/` contains build output.
- `out/` contains generated inspection/export output.

## Documentation Index

The following README files already exist in this repository and are linked here as the main documentation landing page:

- [Object and PGE notes](./src/README.md)
- [PGE type and OBJ node notes](./src/README_PGE_TYPES.md)
- [Inventory item notes](./src/README_INVENTORY.md)
- [Level generator scripts](./src/level-generator/!README.md)
- [Debugger helper scripts](./src/debugger-helpers/README.md)
- [Level format and room notes](./DATA/levels/README.md)
- [Legacy level data notes](./DATA/legacy/legacy-level-data/README.md)
