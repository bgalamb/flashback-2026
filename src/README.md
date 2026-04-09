# Object and PGE Notes

This file documents how PGEs interact in the game, with a focus on message passing between PGEs and a catalog of known concrete PGE instances.

For `object_type`, `type`, and `obj_node_number` notes, see the companion reference:

- [src/README_PGE_TYPES.md](/Users/balazsgalambos/git/flashback-web/src/README_PGE_TYPES.md)

For pickup and inventory-item notes, see:

- [src/README_INVENTORY.md](/Users/balazsgalambos/git/flashback-web/src/README_INVENTORY.md)

## Terms

- `PGE`
  - A live game object. Every entity in the level is represented by a PGE at runtime.
- `PGE index`
  - The slot of a concrete PGE instance inside the level PGE array.
  - Example: Conrad is always live PGE index `0`.
- `script_state_type`
  - The current animation / script state of the PGE.
- `script node`
  - The OBJ-script program attached to the PGE.
- `group signal`
  - A small message sent from one PGE to another. Doors, switches, elevators, pickups, and similar objects use these heavily.

## How PGE messaging works

The important point is that most PGE connections are not hardcoded in TypeScript. They are encoded in level data and executed by the OBJ scripts.

### 1. A source PGE chooses a target

Many opcodes use one of the source PGE's `counter_values[]` entries as a target PGE index.

The clearest examples are:

- `pge_op_updateGroup0`
- `pge_op_updateGroup1`
- `pge_op_updateGroup2`
- `pge_op_updateGroup3`

These send a signal to:

- `counter_values[0]`
- `counter_values[1]`
- `counter_values[2]`
- `counter_values[3]`

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L868)

### 2. The engine queues the signal on the target PGE

Signals are queued by `gameQueuePgeGroupSignal()`.

Important behaviors:

- The target PGE is activated if needed before the signal is queued.
- Signals with IDs `<= 4` are same-room only.
- The queue entry stores both:
  - `senderPgeIndex`
  - `signalId`

See:

- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L280)

### 3. The target PGE consumes its pending signals during its frame

Each active PGE runs one frame of OBJ-script logic in `gameRunPgeFrameLogic()`.

At the start of that frame, the engine looks up pending signals for that PGE and lets them affect:

- animation advancement
- script branching
- collision changes
- state changes

See:

- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L311)
- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L490)

### 4. OBJ opcodes test for the signal

The common read-side opcodes are:

- `pge_op_isInGroup`
  - true if the target PGE has any pending signal with the requested signal ID
- `pge_op_isInGroup1..4`
  - stricter versions that also check the sender against `counter_values[0..3]`

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1015)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1097)

### 5. The target script reacts

Once a condition matches, the target script can do things like:

- change animation / default state
- modify collision cells
- wake or remove another PGE
- forward another signal

Examples:

- `pge_op_setPgeDefaultAnim()`
- `pge_op_setCollisionState0()`
- `pge_op_setCollisionState1()`
- `pge_op_setCollisionState2()`

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1054)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1089)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1508)

## Practical model

For most interactive world objects, the connection looks like this:

1. PGE A runs an opcode such as `updateGroup0`.
2. The opcode uses one of PGE A's `counter_values[]` entries as a target PGE index.
3. The engine queues `(sender=A, signalId=N)` on PGE B.
4. PGE B's OBJ script sees signal `N`.
5. PGE B changes state, animation, and/or collision.

That is the main switch-door pattern.

## Sound note: GLOBAL.FIB vs PGE-driven playback

`GLOBAL.FIB` is the legacy global sound-effect bank, not a standalone ambient scheduler.

The runtime now loads the exported manifest at `DATA/sound_effects/global.fib.json` plus the decoded PCM files in `DATA/sound_effects/pcm_s8_files/` to populate `Resource.audio.sfxList`, the runtime sound-sample array:

- [src/game_runtime.ts](/Users/balazsgalambos/git/flashback-web/src/game_runtime.ts#L59)
- [src/resource/resource.ts](/Users/balazsgalambos/git/flashback-web/src/resource/resource.ts#L605)

Actual playback still happens when gameplay code calls `game.playSound()`. In practice, that can happen:

- directly from OBJ opcodes such as `pge_op_playSound()` and `pge_op_playSoundGroup()`
- from animation-state transitions through `gamePlayPgeAnimationSoundEffect()`

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L845)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1674)
- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L354)
- [src/game_audio.ts](/Users/balazsgalambos/git/flashback-web/src/game_audio.ts#L26)

So a short ambient chirp can still come from a PGE even though the underlying sample lives in `GLOBAL.FIB`.

## Example: room 35 switch controlling room 29 door

In level 1:

| PGE index | Room | Working label | Target / notes | Source |
| --- | --- | --- | --- | --- |
| `3` | `35` | Switch | `counter_values[0] = 4` | [level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L79) |
| `4` | `29` | Door-like target | Target of switch `3` | [level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L104) |

| Wiring | Mechanism |
| --- | --- |
| Switch `3` -> target `4` | `counter_values[0]` |

This is the kind of link we want to keep documenting.

## Example: room 37 switch controlling room 37 door / barrier

In level 1:

| PGE index | Room | Working label | Target / notes | Source |
| --- | --- | --- | --- | --- |
| `6` | `37` | Switch | `counter_values[0] = 5` | [level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L154) |
| `5` | `37` | Door / barrier-like target | Target of switch `6` | [level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L129) |

The OBJ scripts follow the same messaging pattern:

| Script node | Behavior | Source |
| --- | --- | --- |
| `2` | Emits signal `20` via `updateGroup0` | [level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L25776) |
| `9` | Checks for signal `20` and changes state | [level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L26124) |

| Wiring | Mechanism |
| --- | --- |
| Switch `6` -> target `5` | `counter_values[0]` |

Room 37 also contains a cartridge pickup:

| PGE index | Room | Working label | object_id | Position | Source |
| --- | --- | --- | --- | --- | --- |
| `10` | `37` | Cartridge pickup | `3` | `(16, 142)` | [level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L254) |

Its detailed `object_type`, `type`, and `obj_node_number` data is tracked in [src/README_PGE_TYPES.md](/Users/balazsgalambos/git/flashback-web/src/README_PGE_TYPES.md).

## Known PGE indices

These are concrete instance indices, not object types.

| PGE index | Level | Room | Working label | object_id | Position | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `0` | All | n/a | Conrad | n/a | n/a | Confirmed by runtime code and level data |
| `3` | `1` | `35` | Switch | n/a | n/a | Targets PGE `4` |
| `4` | `1` | `29` | Door-like target | n/a | n/a | Target of switch `3` |
| `5` | `1` | `37` | Door / barrier-like target | n/a | n/a | Target of switch `6` |
| `6` | `1` | `37` | Switch | n/a | n/a | Targets PGE `5` |
| `10` | `1` | `37` | Cartridge pickup | `3` | `(16, 142)` | Confirmed pickup |
| `11` | `1` | `46` | Ground trap / hazard | n/a | `(121, 214)` | Trap-like world hazard |
| `12` | `1` | `47` | Lower-floor trap / hazard | n/a | `(192, 214)` | Trap family |
| `13` | `1` | `47` | Lower-floor trap / hazard | n/a | `(160, 214)` | Trap family |
| `14` | `1` | `47` | Lower-floor trap / hazard | n/a | `(96, 214)` | Trap family |
| `15` | `1` | `47` | Elevator | n/a | `(144, 70)` | Explicitly named in code |
| `16` | `1` | `47` | Elevator switch | n/a | `(128, 214)` | `counter_values[0] = 15` |
| `47` | `1` | `47` | Shield charger | n/a | `(213, 142)` | Working label |
| `58` | `1` | `36` | Stone pickup | `1` | `(224, 70)` | Confirmed pickup |
| `66` | `1` | `28` | Credits pickup | n/a | `(208, 214)` | `counter_values = [65, 10, 0, 0]` |
| `86` | `1` | `27` | Ambient sound emitter | n/a | `(80, 214)` | Observed live with `script_state_type = 1147` |
| `90` | `1` | `28` | Enemy robot | n/a | `(96, 214)` | Shares definition with `91` |
| `91` | `1` | `28` | Enemy robot | n/a | `(192, 70)` | Shares definition with `90` |
| `96` | `1` | `36` | Enemy robot | n/a | `(208, 214)` | Same family as `90` / `91` |

Notes:

- PGE indices are level-specific except for Conrad at index `0`.
- A PGE index like `3` in one level does not mean the same thing in every other level.
- Type-family detail lives in [src/README_PGE_TYPES.md](/Users/balazsgalambos/git/flashback-web/src/README_PGE_TYPES.md).

## Cross-Level Seed Catalog

This table extends the catalog with seed entries from the other levels so this README can act as the central source of truth for concrete PGE instances.

For now, the working label for these entries is intentionally set to `unknow` until each one is reviewed in gameplay, scripts, and art data.

| PGE index | Level | Room | Working label | object_id | Position | counter_values | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0` | `2` | `16` | `unknow` | `0` | `(48, 214)` | `[1, 235, 0, 2]` | Seed entry from level 2 |
| `1` | `2` | `64` | `unknow` | `2` | `(192, 142)` | `[2, 0, 0, 0]` | Seed entry from level 2 |
| `2` | `2` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 2 |
| `3` | `2` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 2 |
| `4` | `2` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 2 |
| `5` | `2` | `17` | `unknow` | `3` | `(208, 214)` | `[5, 0, 0, 0]` | Seed entry from level 2 |
| `6` | `2` | `15` | `unknow` | `0` | `(112, 142)` | `[72, 0, 0, 0]` | Seed entry from level 2 |
| `7` | `2` | `15` | `unknow` | `0` | `(37, 142)` | `[0, 0, 0, 0]` | Seed entry from level 2 |
| `8` | `2` | `9` | `unknow` | `0` | `(32, 214)` | `[200, 0, 0, 0]` | Seed entry from level 2 |
| `9` | `2` | `9` | `unknow` | `0` | `(224, 214)` | `[60, 0, 0, 0]` | Seed entry from level 2 |
| `10` | `2` | `9` | `unknow` | `0` | `(0, 214)` | `[8, 0, 0, 0]` | Seed entry from level 2 |
| `0` | `3` | `56` | `unknow` | `0` | `(80, 142)` | `[1, 11, 0, 2]` | Seed entry from level 3 |
| `1` | `3` | `64` | `unknow` | `2` | `(192, 142)` | `[2, 0, 0, 0]` | Seed entry from level 3 |
| `2` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 3 |
| `3` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 3 |
| `4` | `3` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 3 |
| `5` | `3` | `64` | `unknow` | `4` | `(64, 214)` | `[3, 0, 0, 0]` | Seed entry from level 3 |
| `6` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 3 |
| `7` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 3 |
| `8` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 3 |
| `9` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 3 |
| `10` | `3` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 3 |
| `0` | `4_1` | `0` | `unknow` | `0` | `(48, 70)` | `[1, 12, 0, 2]` | Seed entry from level 4_1 |
| `1` | `4_1` | `64` | `unknow` | `2` | `(192, 142)` | `[2, 0, 0, 0]` | Seed entry from level 4_1 |
| `2` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 4_1 |
| `3` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 4_1 |
| `4` | `4_1` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 4_1 |
| `5` | `4_1` | `64` | `unknow` | `3` | `(64, 214)` | `[3, 0, 0, 0]` | Seed entry from level 4_1 |
| `6` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_1 |
| `7` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_1 |
| `8` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_1 |
| `9` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_1 |
| `10` | `4_1` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_1 |
| `0` | `4_2` | `52` | `unknow` | `0` | `(64, 142)` | `[1, 12, 0, 2]` | Seed entry from level 4_2 |
| `1` | `4_2` | `53` | `unknow` | `2` | `(160, 214)` | `[2, 0, 0, 0]` | Seed entry from level 4_2 |
| `2` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 4_2 |
| `3` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 4_2 |
| `4` | `4_2` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 4_2 |
| `5` | `4_2` | `64` | `unknow` | `3` | `(64, 214)` | `[3, 0, 0, 0]` | Seed entry from level 4_2 |
| `6` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_2 |
| `7` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_2 |
| `8` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_2 |
| `9` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_2 |
| `10` | `4_2` | `64` | `unknow` | `0` | `(176, 70)` | `[16, 0, 0, 0]` | Seed entry from level 4_2 |
| `0` | `5_1` | `0` | `unknow` | `0` | `(48, 214)` | `[1, 96, 0, 2]` | Seed entry from level 5_1 |
| `1` | `5_1` | `64` | `unknow` | `2` | `(192, 142)` | `[2, 0, 0, 0]` | Seed entry from level 5_1 |
| `2` | `5_1` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 5_1 |
| `3` | `5_1` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 5_1 |
| `4` | `5_1` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 5_1 |
| `5` | `5_1` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 0, 0, 0]` | Seed entry from level 5_1 |
| `6` | `5_1` | `64` | `unknow` | `3` | `(64, 214)` | `[3, 0, 0, 0]` | Seed entry from level 5_1 |
| `7` | `5_1` | `64` | `unknow` | `0` | `(64, 214)` | `[0, 0, 0, 0]` | Seed entry from level 5_1 |
| `8` | `5_1` | `64` | `unknow` | `0` | `(144, 214)` | `[16, 0, 0, 0]` | Seed entry from level 5_1 |
| `9` | `5_1` | `64` | `unknow` | `0` | `(144, 214)` | `[16, 0, 0, 0]` | Seed entry from level 5_1 |
| `10` | `5_1` | `2` | `unknow` | `0` | `(64, 142)` | `[0, 0, 0, 0]` | Seed entry from level 5_1 |
| `0` | `5_2` | `29` | `unknow` | `0` | `(16, 142)` | `[1, 144, 0, 2]` | Seed entry from level 5_2 |
| `1` | `5_2` | `64` | `unknow` | `2` | `(192, 142)` | `[2, 0, 0, 0]` | Seed entry from level 5_2 |
| `2` | `5_2` | `64` | `unknow` | `0` | `(176, 70)` | `[20, 0, 0, 3]` | Seed entry from level 5_2 |
| `3` | `5_2` | `64` | `unknow` | `0` | `(176, 70)` | `[0, 0, 0, 0]` | Seed entry from level 5_2 |
| `4` | `5_2` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 4, 0, 0]` | Seed entry from level 5_2 |
| `5` | `5_2` | `64` | `unknow` | `3` | `(208, 214)` | `[5, 0, 0, 0]` | Seed entry from level 5_2 |
| `6` | `5_2` | `64` | `unknow` | `3` | `(64, 214)` | `[3, 0, 0, 0]` | Seed entry from level 5_2 |
| `7` | `5_2` | `64` | `unknow` | `0` | `(64, 214)` | `[0, 0, 0, 0]` | Seed entry from level 5_2 |
| `8` | `5_2` | `64` | `unknow` | `0` | `(144, 214)` | `[16, 0, 0, 0]` | Seed entry from level 5_2 |
| `9` | `5_2` | `64` | `unknow` | `0` | `(144, 214)` | `[16, 0, 0, 0]` | Seed entry from level 5_2 |
| `10` | `5_2` | `3` | `unknow` | `0` | `(144, 70)` | `[36, 0, 0, 0]` | Seed entry from level 5_2 |
| `0` | `10` | `18` | `unknow` | `0` | `(208, 70)` | `[1, 0, 0, 2]` | Seed entry from level 10 |
| `1` | `10` | `18` | `unknow` | `0` | `(96, 214)` | `[0, 0, 0, 0]` | Seed entry from level 10 |
| `2` | `10` | `18` | `unknow` | `0` | `(192, 214)` | `[10, 0, 0, 0]` | Seed entry from level 10 |
| `3` | `10` | `18` | `unknow` | `0` | `(0, 70)` | `[72, 0, 0, 0]` | Seed entry from level 10 |
| `4` | `10` | `18` | `unknow` | `0` | `(80, 214)` | `[3, 0, 0, 0]` | Seed entry from level 10 |
| `5` | `10` | `17` | `unknow` | `0` | `(64, 214)` | `[0, 0, 0, 0]` | Seed entry from level 10 |
| `6` | `10` | `17` | `unknow` | `0` | `(96, 214)` | `[5, 0, 0, 0]` | Seed entry from level 10 |
| `7` | `10` | `18` | `unknow` | `0` | `(128, 214)` | `[72, 0, 0, 0]` | Seed entry from level 10 |
| `8` | `10` | `18` | `unknow` | `0` | `(160, 142)` | `[0, 0, 0, 0]` | Seed entry from level 10 |
| `9` | `10` | `19` | `unknow` | `0` | `(208, 142)` | `[8, 0, 0, 0]` | Seed entry from level 10 |
| `10` | `10` | `26` | `unknow` | `0` | `(96, 142)` | `[0, 0, 0, 0]` | Seed entry from level 10 |

## Source references

- Messaging send path: [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L868)
- Messaging queue: [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L280)
- Messaging consume path: [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L311)
- Group-driven animation reaction: [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L490)
- Group tests: [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1015)

## Next additions

Useful future expansions for this file:

- a per-level table of named PGEs
- a catalog of common message signal IDs and what they mean in practice
- more verified working labels in the cross-level seed catalog
- notes on which opcodes are commonly used for doors, elevators, teleports, and inventory objects
