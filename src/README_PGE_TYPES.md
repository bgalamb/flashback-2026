# PGE Type and OBJ Node Notes

This companion file collects the reverse-engineered `object_type`, `type`, and `obj_node_number` data that was previously mixed into the main PGE catalog.

For concrete per-level PGE instance notes, message wiring, and the cross-level seed catalog, see:

- [src/README.md](/Users/balazsgalambos/git/flashback-web/src/README.md)

For pickup and inventory-item-specific notes, see:

- [src/README_INVENTORY.md](/Users/balazsgalambos/git/flashback-web/src/README_INVENTORY.md)

## Known object types

This table is intentionally conservative. "Confirmed" means the code or data strongly supports the meaning. "Likely" means it is a good working label but still worth verifying.

| object_type | Confidence | Working meaning | Evidence |
| --- | --- | --- | --- |
| `1` | Confirmed | Conrad / player PGE | Runtime special-cases object type `1` as the player in multiple places |
| `3` | Confirmed | Pickup / inventory-style world object | Pickup logic explicitly searches for overlapping object type `3` |
| `10` | Confirmed | Monster / enemy | Monster loading and several gameplay checks special-case object type `10` |
| `0` | Likely | Door / barrier / animated obstacle / trap family | Room 29 target door and room 46 ground trap are both `object_type 0` |
| `6` | Likely | Door / barrier / animated obstacle family | Room 37 switch targets PGE `5`, which is `object_type 6` and behaves like the local door / barrier |
| `7` | Likely | Switch / trigger family | Room 35 switch is `object_type 7` |
| `4` | Unclear | Unassigned | Repeats in level data, but meaning not assigned yet |
| `5` | Unclear | Unassigned | Repeats in level data, but meaning not assigned yet |
| `8` | Unclear | Unassigned | Repeats in level data, but meaning not assigned yet |
| `9` | Unclear | Unassigned | Repeats in level data, but meaning not assigned yet |

## Reference catalog

These rows keep the type-oriented fields together in one place for later annotation.

| PGE index | Level | Room | Working label | object_type | type | obj_node_number | object_id | Position | counter_values | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `11` | `1` | `46` | Ground trap / hazard | `0` | `362` | `165` | n/a | `(121, 214)` | `[0, 0, 0, 0]` | Trap-like world hazard |
| `12` | `1` | `47` | Lower-floor trap / hazard | `4` | `382` | `15` | n/a | `(192, 214)` | `[0, 0, 0, 0]` | Trap family |
| `13` | `1` | `47` | Lower-floor trap / hazard | `4` | `382` | `15` | n/a | `(160, 214)` | `[0, 0, 0, 0]` | Trap family |
| `14` | `1` | `47` | Lower-floor trap / hazard | `4` | `382` | `15` | n/a | `(96, 214)` | `[0, 0, 0, 0]` | Trap family |
| `15` | `1` | `47` | Elevator | `8` | `352` | `16` | n/a | `(144, 70)` | `[0, 0, 0, 0]` | Explicitly named in code |
| `16` | `1` | `47` | Elevator switch | `7` | `307` | `12` | n/a | `(128, 214)` | `[15, 0, 0, 0]` | `counter_values[0] = 15` |
| `47` | `1` | `47` | Shield charger | `9` | `402` | `24` | n/a | `(213, 142)` | `[0, 0, 0, 0]` | Working label |
| `86` | `1` | `27` | Ambient sound emitter | `0` | `1143` | `222` | n/a | `(80, 214)` | `[0, 0, 0, 0]` | Observed live with `script_state_type = 1147` |
| `90` | `1` | `28` | Enemy robot | `10` | `939` | `161` | n/a | `(96, 214)` | `[2, 0, 0, 0]` | Shares definition with `91` |
| `91` | `1` | `28` | Enemy robot | `10` | `939` | `161` | n/a | `(192, 70)` | `[2, 0, 0, 0]` | Shares definition with `90` |
| `96` | `1` | `36` | Enemy robot | `10` | `939` | `161` | n/a | `(208, 214)` | `[2, 0, 0, 0]` | Same family as `90` / `91` |

## Example: level 1 room 28 enemy robots

Level 1 room `28` contains two enemy robot PGEs:

| PGE index | object_type | type | obj_node_number | counter_values | Position | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `90` | `10` | `939` | `161` | `[2, 0, 0, 0]` | `(96, 214)` | Enemy robot in room `28` |
| `91` | `10` | `939` | `161` | `[2, 0, 0, 0]` | `(192, 70)` | Enemy robot in room `28` |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2256)

At the moment this file treats their stable IDs as:

- level-local PGE indices `90` and `91`
- shared script/object definition `type 939`, `obj_node_number 161`, `object_type 10`

The runtime monster descriptor table in [src/staticres-monsters.ts](/Users/balazsgalambos/git/flashback-web/src/staticres-monsters.ts) does not currently provide a named monster entry for script node `161`, so this file does not assign a stronger species/name label yet.

## Example: level 1 room 36 robot

Level 1 room `36` contains:

| PGE index | Working label | object_type | type | obj_node_number | Position |
| --- | --- | --- | --- | --- | --- |
| `96` | Enemy robot | `10` | `939` | `161` | `(208, 214)` |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2406)

## Example: level 1 ambient sound emitter

Level 1 also contains at least one PGE that appears to exist mainly to emit a short ambient sound through animation-state changes:

| PGE index | object_type | type | obj_node_number | Init position | Observed live state | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `86` | `0` | `1143` | `222` | `(80, 214)` | `script_state_type = 1147`, `anim_number = 299`, `pos = (48, 70)` | Likely ambient sound emitter |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2155)

Its script node is a compact random state machine over states `1143..1148`:

| Signal / mechanism | Interpretation |
| --- | --- |
| `opcode 97` | `pge_op_isInRandomRange()` |
| Matching branch | Switches the PGE into another animation/state |
| Animation-state change | Can trigger `gamePlayPgeAnimationSoundEffect()` |

See:

- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L115312)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1461)
- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L354)
- [src/game_audio.ts](/Users/balazsgalambos/git/flashback-web/src/game_audio.ts#L26)

| Working interpretation | Result |
| --- | --- |
| `GLOBAL.FIB` | Stores the chirp sample |
| PGE `86` | Invisible ambient emitter that randomly changes state |
| Animation transition | Actual playback trigger |

## Example: level 1 room 46 ground trap

Level 1 room `46` contains a ground-level trap / hazard:

| PGE index | object_type | type | obj_node_number | Position | Working label |
| --- | --- | --- | --- | --- | --- |
| `11` | `0` | `362` | `165` | `(121, 214)` | Ground trap / hazard |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L280)

Its script node cycles through states beginning at type `362`, and the asset table also contains `trappe.spl`, which is consistent with this object being a trap-type world hazard.

See:

- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L113517)
- [src/staticres.ts](/Users/balazsgalambos/git/flashback-web/src/staticres.ts#L717)

## Example: level 1 room 47 elevator, charger, and lower-floor hazards

Level 1 room `47` contains the following notable PGEs:

| PGE index | Working label | object_type | type | obj_node_number | Position | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `47` | Likely shield charger | `9` | `402` | `24` | `(213, 142)` | Working label |
| `15` | Elevator | `8` | `352` | `16` | `(144, 70)` | Explicitly named in code |
| `16` | Elevator switch | `7` | `307` | `12` | `(128, 214)` | `counter_values[0] = 15` |
| `12` | Lower-floor trap / hazard | `4` | `382` | `15` | `(192, 214)` | Trap family |
| `13` | Lower-floor trap / hazard | `4` | `382` | `15` | `(160, 214)` | Trap family |
| `14` | Lower-floor trap / hazard | `4` | `382` | `15` | `(96, 214)` | Trap family |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L306)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L379)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L404)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1191)

| Elevator note | Source |
| --- | --- |
| The codebase explicitly names room 47 elevator PGE index `15` | [src/game_constants.ts](/Users/balazsgalambos/git/flashback-web/src/game_constants.ts#L26) |

| Switch-to-elevator wiring | Mechanism |
| --- | --- |
| Switch `16` targets elevator `15` | `counter_values[0]` |
| Pattern | Same messaging pattern as the room 35 and room 37 switch-target pairs |

| Trap note | Interpretation |
| --- | --- |
| Three identical lower-floor trap/hazard PGEs exist in room `47` | One may be inactive, hidden by room setup, or easy to overlook in play |

## Source references

- Random-range opcode: [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1461)
- Animation sound effect hook: [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L354)
- Monster descriptors: [src/staticres-monsters.ts](/Users/balazsgalambos/git/flashback-web/src/staticres-monsters.ts)
