function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-all-room-indexed-png.ts <dataDir>")
}

function walkFiles(rootDir: string, predicate: (filePath: string) => boolean) {
    const fs = require("fs")
    const path = require("path")
    const out: string[] = []

    function visit(dirPath: string) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (let i = 0; i < entries.length; ++i) {
            const entry = entries[i]
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                visit(fullPath)
            } else if (predicate(fullPath)) {
                out.push(fullPath)
            }
        }
    }

    visit(rootDir)
    out.sort()
    return out
}

function syncFilesManifest(dataDir: string, generatedRelativePaths: string[]) {
    const fs = require("fs")
    const path = require("path")
    const manifestPath = path.join(dataDir, "files.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as string[]
    const generatedSet = new Set(generatedRelativePaths)
    const nextManifest: string[] = []

    for (let i = 0; i < manifest.length; ++i) {
        const entry = manifest[i]
        nextManifest.push(entry)
        if (/\.pixeldata\.bin$/i.test(entry)) {
            const pngEntry = entry.replace(/\.bin$/i, ".png")
            if (generatedSet.has(pngEntry) && manifest.indexOf(pngEntry) === -1) {
                nextManifest.push(pngEntry)
            }
        }
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`)
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 1) {
        printUsage()
        process.exit(1)
    }

    const [dataDir] = args
    const fs = require("fs")
    const path = require("path")
    const childProcess = require("child_process")

    const levelsDir = path.join(dataDir, "levels")
    const pixelFiles = walkFiles(levelsDir, (filePath: string) => /\.pixeldata\.bin$/i.test(filePath))
    const generatedRelativePaths: string[] = []

    for (let i = 0; i < pixelFiles.length; ++i) {
        const pixelPath = pixelFiles[i]
        const dirPath = path.dirname(pixelPath)
        const pixelFileName = path.basename(pixelPath)
        const levelMatch = pixelFileName.match(/^(level\d+)-room\d+\.pixeldata\.bin$/i)
        if (!levelMatch) {
            throw new Error(`Unexpected room pixeldata filename '${pixelFileName}'`)
        }
        const levelName = levelMatch[1].toLowerCase()
        const palettePath = path.join(levelsDir, "legacy-level-data", "palettes", `${levelName}.pal`)
        const paletteHeaderPath = path.join(dirPath, `${levelName}.paletteheader.json`)
        const outputPath = pixelPath.replace(/\.bin$/i, ".png")

        if (!fs.existsSync(palettePath)) {
            throw new Error(`Missing palette file '${palettePath}'`)
        }
        if (!fs.existsSync(paletteHeaderPath)) {
            throw new Error(`Missing palette header file '${paletteHeaderPath}'`)
        }

        childProcess.execFileSync(
            "npx",
            [
                "ts-node",
                "--transpile-only",
                "./src/tools/debugger/export-room-indexed-png.ts",
                pixelPath,
                palettePath,
                paletteHeaderPath,
                outputPath
            ],
            {
                stdio: "inherit"
            }
        )

        generatedRelativePaths.push(path.relative(dataDir, outputPath).replace(/\\/g, "/"))
    }

    syncFilesManifest(dataDir, generatedRelativePaths)
    console.log(`Generated ${generatedRelativePaths.length} indexed PNG room files`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
