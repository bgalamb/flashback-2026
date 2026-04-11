import { GlobalFibAudioExporter } from "./global-fib-audio-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger/audio/export-global-fib-audio.ts <dataDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 1) {
        printUsage()
        process.exit(1)
    }

    const [dataDir] = args
    const result = GlobalFibAudioExporter.export(dataDir)
    console.log(`Wrote manifest:`)
    console.log(result.manifestPath)
    console.log(`Wrote ${result.writtenFiles.length} decoded PCM files`)
}

main()
