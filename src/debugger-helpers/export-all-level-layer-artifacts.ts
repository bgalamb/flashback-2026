import { AmigaLevelImageExporter } from "./amiga-level-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-level-layer-artifacts.ts <dataDir> <outputDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputDir] = args
    AmigaLevelImageExporter.exportAllGameLevelRoomLayerArtifacts(dataDir, outputDir, 1, 100)
}

main()
