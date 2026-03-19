# README_OBJECTS

This file documents how PGEs interact in the game, with a focus on message passing between PGEs and a small catalog of known PGE identifiers.

## Terms

- `PGE`
  - A live game object. Every entity in the level is represented by a PGE at runtime.
- `PGE index`
  - The slot of a concrete PGE instance inside the level PGE array.
  - Example: Conrad is always live PGE index `0`.
- `object_type`
  - A coarse gameplay category stored in `init_PGE.object_type`.
  - Many different PGEs can share the same `object_type`.
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

`GLOBAL.FIB` is the global sound-effect bank, not a standalone ambient scheduler.

The runtime loads `GLOBAL.FIB` once at startup and decodes it into the `_sfxList` array of sound samples:

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

- room 35 contains PGE index `3`
- room 29 contains PGE index `4`

PGE `3`:

- has `object_type: 7`
- lives in room `35`
- has `counter_values[0] = 4`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L79)

PGE `4`:

- has `object_type: 0`
- lives in room `29`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L104)

So the wiring is:

- switch PGE `3` -> target PGE `4` via `counter_values[0]`

This is the kind of link we want to keep documenting.

## Example: room 37 switch controlling room 37 door / barrier

In level 1:

- room 37 contains switch PGE index `6`
- room 37 also contains target PGE index `5`

PGE `6`:

- has `object_type: 7`
- lives in room `37`
- has `counter_values[0] = 5`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L154)

PGE `5`:

- has `object_type: 6`
- lives in room `37`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L129)

The OBJ scripts follow the same messaging pattern:

- switch node `2` emits signal `20` via `updateGroup0`
- target node `9` checks for signal `20` and changes state

See:

- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L25776)
- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L26124)

So the wiring is:

- switch PGE `6` -> target PGE `5` via `counter_values[0]`

Room 37 also contains a cartridge pickup:

- PGE `10`
  - `object_type = 3`
  - `type = 320`
  - `obj_node_number = 23`
  - `object_id = 3`
  - position `(16, 142)`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L254)

## Known PGE indices

These are concrete instance indices, not object types.

Confirmed:

- PGE index `0`
  - Conrad
  - confirmed by runtime code and level data
- Level 1 PGE index `3`
  - switch in room `35`
  - `object_type = 7`
  - targets PGE `4`
- Level 1 PGE index `4`
  - door-like object in room `29`
  - `object_type = 0`
  - target of switch PGE `3`
- Level 1 PGE index `6`
  - switch in room `37`
  - `object_type = 7`
  - targets PGE `5`
- Level 1 PGE index `5`
  - door / barrier-like target in room `37`
  - `object_type = 6`
  - target of switch PGE `6`
- Level 1 PGE index `10`
  - cartridge pickup in room `37`
  - `object_type = 3`
  - `type = 320`
  - `obj_node_number = 23`
  - `object_id = 3`
  - position `(16, 142)`
- Level 1 PGE index `66`
  - credits pickup in room `28`
  - `object_type = 3`
  - `type = 329`
  - `obj_node_number = 38`
  - position `(208, 214)`
  - `counter_values = [65, 10, 0, 0]`
- Level 1 PGE index `86`
  - ambient sound emitter in room `27`
  - `object_type = 0`
  - `type = 1143`
  - `obj_node_number = 222`
  - position `(80, 214)` in init data
  - live sample observed in room `27` with `script_state_type = 1147`
- Level 1 PGE index `58`
  - stone pickup in room `36`
  - `object_type = 3`
  - `type = 131`
  - `obj_node_number = 19`
  - `object_id = 1`
  - position `(224, 70)`
- Level 1 PGE index `11`
  - ground trap / hazard in room `46`
  - `object_type = 0`
  - `type = 362`
  - `obj_node_number = 165`
  - position `(121, 214)`
- Level 1 PGE index `47`
  - shield charger in room `47`
  - `object_type = 9`
  - `type = 402`
  - `obj_node_number = 24`
  - position `(213, 142)`
- Level 1 PGE index `15`
  - elevator in room `47`
  - `object_type = 8`
  - `type = 352`
  - `obj_node_number = 16`
  - position `(144, 70)`
- Level 1 PGE index `16`
  - switch controlling the room `47` elevator
  - `object_type = 7`
  - `type = 307`
  - `obj_node_number = 12`
  - position `(128, 214)`
  - `counter_values[0] = 15`
- Level 1 PGE indices `12`, `13`, `14`
  - lower-floor trap / hazard family in room `47`
  - all three have:
    - `object_type = 4`
    - `type = 382`
    - `obj_node_number = 15`
  - positions:
    - PGE `12`: `(192, 214)`
    - PGE `13`: `(160, 214)`
    - PGE `14`: `(96, 214)`
- Level 1 PGE indices `90` and `91`
  - the two enemy robot PGEs in room `28`
  - both have:
    - `object_type = 10`
    - `type = 939`
    - `obj_node_number = 161`
  - PGE `90`
    - room `28`
    - position `(96, 214)`
  - PGE `91`
    - room `28`
    - position `(192, 70)`
- Level 1 PGE index `96`
  - enemy robot PGE in room `36`
  - `object_type = 10`
  - `type = 939`
  - `obj_node_number = 161`
  - position `(208, 214)`

Notes:

- PGE indices are level-specific except for Conrad at index `0`.
- A PGE index like `3` in one level does not mean the same thing in every other level.

## Example: level 1 room 28 enemy robots

Level 1 room `28` contains two enemy robot PGEs:

- PGE `90`
- PGE `91`

Both entries share the same base definition:

- `object_type = 10`
- `type = 939`
- `obj_node_number = 161`
- `counter_values = [2, 0, 0, 0]`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2256)

At the moment this README treats their stable IDs as:

- level-local PGE indices `90` and `91`
- shared script/object definition `type 939`, `obj_node_number 161`, `object_type 10`

The runtime monster descriptor table in [src/staticres-monsters.ts](/Users/balazsgalambos/git/flashback-web/src/staticres-monsters.ts) does not currently provide a named monster entry for script node `161`, so this file does not assign a stronger species/name label yet.

## Example: level 1 room 28 credits pickup

Level 1 room `28` also contains a credits pickup:

- PGE `66`

Its identifying fields are:

- `object_type = 3`
- `type = 329`
- `obj_node_number = 38`
- position `(208, 214)`
- `counter_values = [65, 10, 0, 0]`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1656)

Credits pickups are handled by `pge_op_addToCredits()`:

- `counter_values[0]` = credits inventory PGE index
- `counter_values[1]` = credit amount to add

For this room 28 pickup, that means:

- inventory / counter target PGE index `65`
- amount `10`

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1484)

## Example: level 1 room 36 stone pickup and robot

Level 1 room `36` contains:

- PGE `58`
  - stone pickup
  - `object_type = 3`
  - `type = 131`
  - `obj_node_number = 19`
  - `object_id = 1`
  - position `(224, 70)`
- PGE `96`
  - enemy robot
  - `object_type = 10`
  - `type = 939`
  - `obj_node_number = 161`
  - position `(208, 214)`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1431)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2406)

## Example: level 1 ambient sound emitter

Level 1 also contains at least one PGE that appears to exist mainly to emit a short ambient sound through animation-state changes:

- PGE `86`
  - `object_type = 0`
  - `type = 1143`
  - `obj_node_number = 222`
  - init position `(80, 214)`
  - observed live in room `27` as:
    - `script_state_type = 1147`
    - `anim_number = 299`
    - `pos = (48, 70)`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L2155)

Its script node is a compact random state machine over states `1143..1148`:

- `opcode 97` is `pge_op_isInRandomRange()`
- matching that condition can switch the PGE into another animation/state
- when the state changes, the engine checks the animation metadata for a linked sound effect and plays it through `gamePlayPgeAnimationSoundEffect()`

See:

- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L115312)
- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1461)
- [src/game_pge.ts](/Users/balazsgalambos/git/flashback-web/src/game_pge.ts#L354)
- [src/game_audio.ts](/Users/balazsgalambos/git/flashback-web/src/game_audio.ts#L26)

Working interpretation:

- `GLOBAL.FIB` stores the chirp sample
- PGE `86` is an invisible ambient emitter that randomly changes state
- the animation transition is what actually triggers playback

## Example: level 1 room 46 ground trap

Level 1 room `46` contains a ground-level trap / hazard:

- PGE `11`
  - `object_type = 0`
  - `type = 362`
  - `obj_node_number = 165`
  - position `(121, 214)`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L280)

Its script node cycles through states beginning at type `362`, and the asset table also contains `trappe.spl`, which is consistent with this object being a trap-type world hazard.

See:

- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json#L113517)
- [src/staticres.ts](/Users/balazsgalambos/git/flashback-web/src/staticres.ts#L717)

## Example: level 1 room 47 elevator, charger, and lower-floor hazards

Level 1 room `47` contains the following notable PGEs:

- PGE `47`
  - likely shield charger
  - `object_type = 9`
  - `type = 402`
  - `obj_node_number = 24`
  - position `(213, 142)`
- PGE `15`
  - elevator
  - `object_type = 8`
  - `type = 352`
  - `obj_node_number = 16`
  - position `(144, 70)`
- PGE `16`
  - switch controlling the elevator
  - `object_type = 7`
  - `type = 307`
  - `obj_node_number = 12`
  - position `(128, 214)`
  - `counter_values[0] = 15`
- PGE `12`
  - lower-floor trap / hazard
  - `object_type = 4`
  - `type = 382`
  - `obj_node_number = 15`
  - position `(192, 214)`
- PGE `13`
  - lower-floor trap / hazard
  - `object_type = 4`
  - `type = 382`
  - `obj_node_number = 15`
  - position `(160, 214)`
- PGE `14`
  - lower-floor trap / hazard
  - `object_type = 4`
  - `type = 382`
  - `obj_node_number = 15`
  - position `(96, 214)`

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L306)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L379)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L404)
- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1191)

Elevator notes:

- the codebase explicitly names room 47 elevator PGE index `15`

See:

- [src/game_constants.ts](/Users/balazsgalambos/git/flashback-web/src/game_constants.ts#L26)

Switch-to-elevator wiring:

- switch PGE `16` targets elevator PGE `15` through `counter_values[0]`
- that follows the same PGE messaging pattern as the room 35 and room 37 switch-target pairs

Trap note:

- the level data contains three identical lower-floor trap/hazard PGEs in room `47`
- if gameplay/visuals suggest only two electric traps, then one of these three entries may be inactive, hidden by the room setup, or simply easy to overlook in play

## Known object types

This table is intentionally conservative. "Confirmed" means the code or data strongly supports the meaning. "Likely" means it is a good working label but still worth verifying.

Confirmed:

- `object_type 1`
  - Conrad / player PGE
  - evidence: runtime special-cases object type `1` as the player in multiple places
- `object_type 3`
  - pickup / inventory-style world object
  - use this as the working "inventory item in the world" type
  - evidence: pickup logic explicitly searches for overlapping object type `3`
- `object_type 10`
  - monster / enemy
  - use this as the working "enemy" type
  - evidence: monster loading and several gameplay checks special-case object type `10`

Likely:

- `object_type 0`
  - door / barrier / animated obstacle / trap family
  - evidence: the room 29 target door in the room 35 example is object type `0`, and the room 46 ground trap is also `object_type 0`
- `object_type 6`
  - door / barrier / animated obstacle family
  - evidence: the room 37 switch targets PGE `5`, which is `object_type 6` and behaves like the local door / barrier
- `object_type 7`
  - switch / trigger family
  - evidence: the room 35 switch is object type `7`

Unclear:

- `object_type 4`
- `object_type 5`
- `object_type 8`
- `object_type 9`

These appear repeatedly in level data, but this file does not assign names to them yet.

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
- a stronger object-type table once more examples are verified
- notes on which opcodes are commonly used for doors, elevators, teleports, and inventory objects
