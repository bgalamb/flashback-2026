# Sound Effects

The game no longer loads `DATA/global.fib` at runtime.

At startup it loads:

- `DATA/sound_effects/global.fib.json`
- `DATA/sound_effects/pcm_s8_files/output_<index>.pcm_u8`

Those files are converted into `Resource.audio.sfxList`, and gameplay code plays them by numeric sound id.

## Current Layout

- `global.fib.json`: manifest for every logical sound slot
- `pcm_s8_files/output_<index>.pcm_u8`: raw decoded PCM for a slot

The manifest contains:

- `index`: sound id used by the game
- `decodedLength`: number of PCM bytes in the file
- `freq`: playback sample rate, usually `6000`
- `peak`: max absolute signed sample value
- `file`: relative path to the PCM asset, or `null` for an empty slot

`offset` and `encodedLength` are legacy metadata copied from `GLOBAL.FIB`. They are useful for traceability, but the runtime does not need them for playback.

## PCM Format

Each `*.pcm_u8` file is raw mono 8-bit signed PCM.

The extension says `u8` because the bytes are stored in a `Uint8Array`, but playback treats them as signed 8-bit samples in the `[-128, 127]` range.

## Regenerate From GLOBAL.FIB

If you want the exported assets to mirror the legacy DOS bank again, run:

```bash
npm run export:audio:sfx -- ./DATA
```

This will:

- decode every sound from `DATA/global.fib`
- rewrite `DATA/sound_effects/global.fib.json`
- rewrite every non-empty PCM file in `DATA/sound_effects/pcm_s8_files/`
- add missing output paths to `DATA/files.json`

Use this when `GLOBAL.FIB` changes and you want the runtime assets to match it exactly.

## Add Or Replace A Sound Effect

If you want to add a new effect without relying on `GLOBAL.FIB`, update the manifest and PCM files directly.

### 1. Pick a sound id

Existing gameplay sound effects are loaded from manifest slots `0..numSfx-1`.

Important reserved ids in runtime code:

- `66`: inventory open/close special case
- `68..75`: music cues
- `77`: platform landing special case

If you only need a new SFX slot, prefer reusing an empty slot from the manifest first. At the time of writing these empty slots are:

- `6`
- `14`
- `23`
- `33`
- `35`
- `64`

If you add a brand-new slot above the current highest index, also increase `numSfx` and append a matching manifest entry.

### 2. Add the PCM file

Create:

```text
DATA/sound_effects/pcm_s8_files/output_<index>.pcm_u8
```

Requirements:

- mono raw PCM
- signed 8-bit samples
- no WAV header

### 3. Update the manifest

Edit `DATA/sound_effects/global.fib.json` and add or update the matching entry.

For a custom sound that did not come from `GLOBAL.FIB`, it is fine to use:

- `offset: 0`
- `encodedLength: 0`

The important fields are:

- `index`
- `decodedLength`
- `freq`
- `peak`
- `file`

Example:

```json
{
  "index": 64,
  "offset": 0,
  "encodedLength": 0,
  "decodedLength": 3200,
  "freq": 6000,
  "peak": 42,
  "file": "sound_effects/pcm_s8_files/output_64.pcm_u8"
}
```

How to compute values:

- `decodedLength`: byte length of the PCM file
- `freq`: playback rate for the asset
- `peak`: largest absolute signed sample value in the file

If the slot should be empty, set:

- `decodedLength: 0`
- `peak: 0`
- `file: null`

### 4. Keep DATA/files.json in sync

If you add a new PCM file or a new manifest path, make sure `DATA/files.json` contains it so the browser-side virtual filesystem can resolve it.

The current runtime requires:

- `sound_effects/global.fib.json`
- every referenced `sound_effects/pcm_s8_files/output_<index>.pcm_u8`

### 5. Trigger the sound in gameplay

The asset alone does not make the game play it. Something in gameplay still needs to request the numeric sound id.

Typical call sites:

- script-driven sound playback
- animation sound transitions
- direct calls to `game.playSound()`

See:

- `src/game/game_audio.ts`
- `src/game/game_opcodes.ts`
- `src/game/game_pge.ts`

## Recommended Validation

Run the focused tests after changing sound assets or the exporter:

```bash
node --require ts-node/register/transpile-only --test \
  test/global_fib_audio_exporter.test.js \
  test/resource.test.js \
  test/game_runtime.test.js
```

These cover:

- exporting a `.fib` bank into manifest + PCM files
- loading the manifest-backed sound bank
- boot-time preference for `loadSoundEffects()` over legacy `loadFib()`
