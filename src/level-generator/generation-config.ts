import * as path from "path"

const DEFAULT_LEVEL_DATA_ROOT = path.join("DATA", "levels")
const DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT = path.join("DATA", "levels", "tmp_generated")

function resolveDefaultCollisionDir(levelName: string) {
    return path.resolve(DEFAULT_LEVEL_DATA_ROOT, levelName, "collisions")
}

function resolveDefaultGeneratedLevelDir(levelName: string) {
    return path.resolve(DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT, levelName)
}

export { DEFAULT_LEVEL_DATA_ROOT, DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT, resolveDefaultCollisionDir, resolveDefaultGeneratedLevelDir }
