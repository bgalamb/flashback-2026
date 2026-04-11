import * as fs from "fs"
import * as path from "path"

const sourceDir = path.join("src", "sound_effects")
const targetDir = path.join("DATA", "sound_effects")

function main() {
    if (!fs.existsSync(sourceDir)) {
        console.log(`[sound-effects-sync] source missing: ${sourceDir}`)
        return
    }

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.cpSync(sourceDir, targetDir, { recursive: true })

    const manifestPath = path.join(targetDir, "global.fib.json")
    const pcmDir = path.join(targetDir, "pcm_s8_files")
    const pcmFileCount = fs.existsSync(pcmDir)
        ? fs.readdirSync(pcmDir).filter((name) => name.endsWith(".pcm_u8")).length
        : 0

    console.log(
        `[sound-effects-sync] copied src/sound_effects -> DATA/sound_effects manifest=${fs.existsSync(manifestPath)} pcm=${pcmFileCount}`
    )
}

main()
