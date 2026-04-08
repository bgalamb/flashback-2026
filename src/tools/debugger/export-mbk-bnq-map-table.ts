import { readBeUint16, readBeUint32 } from "../../core/intern"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-mbk-bnq-map-table.ts <mbk> <bnq> [outputDir]")
}

function toAsciiTable(rows: string[][]): string {
    if (rows.length === 0) {
        return ""
    }
    const widths: number[] = []
    for (const row of rows) {
        for (let i = 0; i < row.length; ++i) {
            widths[i] = Math.max(widths[i] || 0, row[i].length)
        }
    }
    const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+"
    const fmt = (row: string[]) => "|" + row.map((cell, i) => ` ${cell.padEnd(widths[i])} `).join("|") + "|"
    const lines: string[] = []
    lines.push(sep)
    lines.push(fmt(rows[0]))
    lines.push(sep)
    for (let i = 1; i < rows.length; ++i) {
        lines.push(fmt(rows[i]))
    }
    lines.push(sep)
    return lines.join("\n") + "\n"
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const [mbkPath, bnqPath, outputDirArg] = args
    const outputDir = outputDirArg || "out/mbk-bnq-maps"

    const fs = require("fs")
    const path = require("path")

    const mbk = new Uint8Array(fs.readFileSync(mbkPath))
    const bnq = new Uint8Array(fs.readFileSync(bnqPath))
    const entryCount = Math.min(mbk.length > 0 ? mbk[0] : 0, bnq.length > 0 ? bnq[0] : 0)

    const header = [
        "index",
        "mbk_offset",
        "mbk_len_word",
        "mbk_len_bytes",
        "bnq_offset",
        "bnq_len_word",
        "bnq_len_bytes",
        "bnq_tiles"
    ]
    const rows: string[][] = [header]

    for (let i = 0; i < entryCount; ++i) {
        const mbkOffset = readBeUint32(mbk, i * 6) & 0xFFFF
        const mbkLenWord = readBeUint16(mbk, i * 6 + 4)
        const mbkLenBytes = ((mbkLenWord & 0x8000) !== 0 ? (mbkLenWord & 0x7FFF) : mbkLenWord) * 32

        const bnqOffset = readBeUint32(bnq, i * 6) & 0xFFFF
        const bnqLenWord = readBeUint16(bnq, i * 6 + 4)
        let bnqLenSigned = bnqLenWord
        if ((bnqLenSigned & 0x8000) !== 0) {
            bnqLenSigned = -((bnqLenSigned << 16) >> 16)
        }
        const bnqLenBytes = bnqLenSigned * 32
        const bnqTiles = bnqLenBytes > 0 ? (bnqLenBytes / 32) >> 0 : 0

        rows.push([
            String(i),
            String(mbkOffset),
            String(mbkLenWord),
            String(mbkLenBytes),
            String(bnqOffset),
            String(bnqLenWord),
            String(bnqLenBytes),
            String(bnqTiles)
        ])
    }

    fs.mkdirSync(outputDir, { recursive: true })
    const mbkBase = path.basename(mbkPath).replace(/\.[^.]+$/, "")
    const bnqBase = path.basename(bnqPath).replace(/\.[^.]+$/, "")
    const base = `${mbkBase}-${bnqBase}-index-map`
    const csvPath = path.join(outputDir, `${base}.csv`)
    const txtPath = path.join(outputDir, `${base}.txt`)

    const csv = rows.map((row) => row.join(",")).join("\n") + "\n"
    const txt = toAsciiTable(rows)
    fs.writeFileSync(csvPath, csv)
    fs.writeFileSync(txtPath, txt)

    console.log(`Wrote ${csvPath}`)
    console.log(`Wrote ${txtPath}`)
}

main()
