import * as path from "path"

const defaultLevelDataRoot = path.join("DATA", "levels")
const defaultLevelGeneratorOutputRoot = defaultLevelDataRoot

function resolveDefaultCollisionDir(levelName: string) {
    return path.resolve("src", "collisions", levelName)
}

function resolveDefaultGeneratedLevelDir(levelName: string) {
    return path.resolve(defaultLevelGeneratorOutputRoot, levelName)
}

export { defaultLevelDataRoot, defaultLevelGeneratorOutputRoot, resolveDefaultCollisionDir, resolveDefaultGeneratedLevelDir }
