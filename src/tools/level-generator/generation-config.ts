import * as path from "path"

const defaultLevelDataRoot = path.join("DATA", "levels")
const defaultLevelGeneratorOutputRoot = path.join("DATA", "levels", "tmp_generated")

function resolveDefaultCollisionDir(levelName: string) {
    return path.resolve(defaultLevelDataRoot, levelName, "collisions")
}

function resolveDefaultGeneratedLevelDir(levelName: string) {
    return path.resolve(defaultLevelGeneratorOutputRoot, levelName)
}

export { defaultLevelDataRoot, defaultLevelGeneratorOutputRoot, resolveDefaultCollisionDir, resolveDefaultGeneratedLevelDir }
