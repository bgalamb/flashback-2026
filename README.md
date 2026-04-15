# flashback-web

This repository contains the web/TypeScript version of *Flashback*, along with the game data, build scripts, and debugging/export helpers used to inspect and regenerate runtime assets.
*It's a full rewrite of the engine and the underlying game data.*

It hasn't been easier to add new levels! :) They will come soon.

The game is available at https://bgalamb.github.io/flashback-2026/.
The game is a work in progress and is not yet complete.
It's is based on the works previously done 
- https://deepwiki.com/chermenin/REminiscence/3.2-game-engine-core
- https://github.com/warpdesign/flashback-web and https://warpdesign.github.io/flashback-web/
- https://cyxx.github.io/dpoly_js/
## Quick Start

Install dependencies if needed, then use the common scripts from the repository root:

```bash
npm run dev
npm run build
npm run check
```

`npm run build` now produces a self-contained `dist/` directory for static hosting, including `DATA/`, the audio worklet bundle, and a `.nojekyll` marker for GitHub Pages.

## Project Areas

- `src/` contains the TypeScript runtime, gameplay logic, and helper tooling.
- `DATA/` contains level data, generated runtime assets, and legacy source assets used by exporters/rebuilders.
- `dist/` contains build output.
- `out/` contains generated inspection/export output.

## GitHub Pages

The repository is set up for a stable public site plus PR previews:

- pushes to `main` deploy the game to `https://bgalamb.github.io/flashback-2026/`
- pull requests from branches in this repository deploy previews to `https://bgalamb.github.io/flashback-2026/pr-<number>/`

To enable this in GitHub:

1. Go to `Settings` -> `Pages`.
2. Set `Source` to `Deploy from a branch`.
3. Choose the `gh-pages` branch and `/ (root)`.
4. In `Settings` -> `Actions` -> `General`, make sure workflows have read/write permission for `GITHUB_TOKEN`.

Notes:

- PR previews are only published for branches in this repository. Fork PRs are skipped for safety.
- The production deploy preserves `pr-*` folders on the `gh-pages` branch so previews continue to work after `main` updates.

## Documentation Index

The following README files already exist in this repository and are linked here as the main documentation landing page:

- [Object and PGE notes](./src/README.md)
- [PGE type and OBJ node notes](./src/README_PGE_TYPES.md)
- [Inventory item notes](./src/README_INVENTORY.md)
- [Level generator scripts](./src/level-generator/!README.md)
- [Debugger helper scripts](./src/debugger-helpers/README.md)
- [Level format and room notes](./DATA/levels/README.md)
- [Legacy level data notes](src/legacy/legacy-level-data/README.md)
