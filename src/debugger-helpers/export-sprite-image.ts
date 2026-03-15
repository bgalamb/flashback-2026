import { SpriteImageExporter } from "./sprite-image-exporter"

function printUsage() {
    console.error("Usage:")
    console.error("  npx ts-node --transpile-only ./src/debugger-helpers/export-sprite-image.ts <spr> <off> <spriteIndex> <paletteRef> <output.png> [flags]")
    console.error("  npx ts-node --transpile-only ./src/debugger-helpers/export-sprite-image.ts <spr> <off> all <paletteRef> <outputDir> [flags]")
    console.error("paletteRef can be 'conrad:<variantId>' or 'monster:<level>:<monsterScriptNodeIndex>'")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 5 || args.length > 6) {
        printUsage()
        process.exit(1)
    }

    const [spritePath, offsetPath, spriteIndexArg, paletteRef, outputPath, flagsArg] = args
    const exportAllSprites = spriteIndexArg.toLowerCase() === "all"
    const spriteIndex = exportAllSprites ? -1 : Number(spriteIndexArg)
    const flags = flagsArg ? Number(flagsArg) : 0

    if (!exportAllSprites && (!Number.isInteger(spriteIndex) || spriteIndex < 0)) {
        printUsage()
        process.exit(1)
    }

    if (!Number.isInteger(flags) || flags < 0) {
        printUsage()
        process.exit(1)
    }

    if (exportAllSprites) {
        SpriteImageExporter.exportAllSpriteImages(spritePath, offsetPath, paletteRef, outputPath, flags)
        console.log(`Wrote sprite images to ${outputPath}`)
        return
    }

    SpriteImageExporter.exportSpriteImage(spritePath, offsetPath, spriteIndex, paletteRef, outputPath, flags)
    console.log(`Wrote ${outputPath}`)
}

main()
