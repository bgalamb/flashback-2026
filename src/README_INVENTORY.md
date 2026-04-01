# Inventory Item Notes

This file collects reverse-engineered notes for pickup and inventory-style PGEs.

For the broader PGE catalog, see:

- [src/README.md](/Users/balazsgalambos/git/flashback-web/src/README.md)

For `object_type`, `type`, and `obj_node_number` families, see:

- [src/README_PGE_TYPES.md](/Users/balazsgalambos/git/flashback-web/src/README_PGE_TYPES.md)

## Known inventory-style PGEs

These are the currently documented pickup and inventory-style world objects.

| PGE index | Level | Room | Working label | object_type | type | obj_node_number | object_id | Position | counter_values | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `10` | `1` | `37` | Cartridge pickup | `3` | `320` | `23` | `3` | `(16, 142)` | `[0, 0, 0, 0]` | Confirmed pickup |
| `58` | `1` | `36` | Stone pickup | `3` | `131` | `19` | `1` | `(224, 70)` | `[0, 0, 0, 0]` | Confirmed pickup |
| `66` | `1` | `28` | Credits pickup | `3` | `329` | `38` | n/a | `(208, 214)` | `[65, 10, 0, 0]` | Credits inventory target in slot `[0]`, amount in slot `[1]` |

## Example: level 1 room 28 credits pickup

Level 1 room `28` contains a credits pickup:

| PGE index | object_type | type | obj_node_number | Position | counter_values | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `66` | `3` | `329` | `38` | `(208, 214)` | `[65, 10, 0, 0]` | Credits pickup |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1656)

Credits pickups are handled by `pge_op_addToCredits()`:

- `counter_values[0]` = credits inventory PGE index
- `counter_values[1]` = credit amount to add

| counter_values slot | Meaning | Value |
| --- | --- | --- |
| `[0]` | Inventory / counter target PGE index | `65` |
| `[1]` | Credits amount to add | `10` |

See:

- [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1484)

## Example: level 1 room 36 stone pickup

Level 1 room `36` contains a stone pickup:

| PGE index | Working label | object_type | type | obj_node_number | object_id | Position |
| --- | --- | --- | --- | --- | --- | --- |
| `58` | Stone pickup | `3` | `131` | `19` | `1` | `(224, 70)` |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L1431)

## Example: level 1 room 37 cartridge pickup

Level 1 room `37` contains a cartridge pickup:

| PGE index | Working label | object_type | type | obj_node_number | object_id | Position |
| --- | --- | --- | --- | --- | --- | --- |
| `10` | Cartridge pickup | `3` | `320` | `23` | `3` | `(16, 142)` |

See:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json#L254)

## Source references

- Pickup overlap checks: [src/game.ts](/Users/balazsgalambos/git/flashback-web/src/game.ts#L628)
- Credits opcode: [src/game_opcodes.ts](/Users/balazsgalambos/git/flashback-web/src/game_opcodes.ts#L1484)
