import { analyzeAdjacencyConsistency, analyzeGrid, fillEnclosedVoidRegions, fixMisalignedTopFloorSupport, fixOddSolidRunParity, fixOneStepObstacles, fixUnreachableStablePlatforms, formatSpans, formatVoidRegions, loadLevelGridModel, repairCluster } from "./room-grid-validity-checker"
import * as fs from "fs"
import * as path from "path"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/level-generator/check-room-grid-validity.ts [--fix-top-floor-support] [--fix-odd-span-parity] [--fix-one-step-obstacles] [--fix-unreachable-platforms] [--fix-enclosed-voids] [--repair-cluster=26,27] [--repair-max-depth=6] [--repair-max-nodes=40000] <room-grid.txt> [more-room-grid.txt...]")
}

function main() {
    const rawArgs = process.argv.slice(2)
    const shouldFixTopFloorSupport = rawArgs.includes("--fix-top-floor-support")
    const shouldFixOddSpanParity = rawArgs.includes("--fix-odd-span-parity")
    const shouldFixOneStepObstacles = rawArgs.includes("--fix-one-step-obstacles")
    const shouldFixUnreachablePlatforms = rawArgs.includes("--fix-unreachable-platforms")
    const shouldFixEnclosedVoids = rawArgs.includes("--fix-enclosed-voids")
    const repairClusterArg = rawArgs.find((arg) => arg.startsWith("--repair-cluster="))
    const repairMaxDepthArg = rawArgs.find((arg) => arg.startsWith("--repair-max-depth="))
    const repairMaxNodesArg = rawArgs.find((arg) => arg.startsWith("--repair-max-nodes="))
    const repairClusterRooms = repairClusterArg
        ? repairClusterArg.replace("--repair-cluster=", "").split(",").map((part) => Number(part.trim())).filter((value) => Number.isInteger(value) && value >= 0)
        : []
    const repairMaxDepth = repairMaxDepthArg ? Number(repairMaxDepthArg.replace("--repair-max-depth=", "")) : undefined
    const repairMaxNodes = repairMaxNodesArg ? Number(repairMaxNodesArg.replace("--repair-max-nodes=", "")) : undefined
    const args = rawArgs.filter((arg) => arg !== "--fix-top-floor-support" && arg !== "--fix-odd-span-parity" && arg !== "--fix-one-step-obstacles" && arg !== "--fix-unreachable-platforms" && arg !== "--fix-enclosed-voids" && arg !== repairClusterArg && arg !== repairMaxDepthArg && arg !== repairMaxNodesArg)
    if (args.length === 0) {
        printUsage()
        process.exit(1)
    }

    const resolvedPaths = args.map((rawPath) => path.resolve(rawPath))

    if (shouldFixUnreachablePlatforms) {
        const summaries = fixUnreachableStablePlatforms(resolvedPaths)
        for (const summary of summaries) {
            console.log(`Fixed unreachable stable platforms in ${summary.filePath}: ${summary.changes.map((change) => `${change.floor}:${change.startX === change.endX ? change.startX : `${change.startX}-${change.endX}`}->${change.loweredTo}`).join(", ")}`)
        }
    }

    if (repairClusterArg && repairClusterRooms.length > 0) {
        const repair = repairCluster(resolvedPaths, repairClusterRooms, {
            maxDepth: Number.isFinite(repairMaxDepth) ? repairMaxDepth : undefined,
            maxNodes: Number.isFinite(repairMaxNodes) ? repairMaxNodes : undefined,
        })
        if (repair) {
            if (!repair.changed) {
                console.log(`Cluster repair made no changes for rooms [${repair.targetRooms.join(", ")}], remaining score=${repair.remainingScore}`)
            } else if (repair.repaired) {
                console.log(`Cluster repair succeeded for rooms [${repair.targetRooms.join(", ")}] in ${repair.passes} pass(es): ${repair.changes.map((change) => change.note).join("; ")}`)
            } else {
                console.log(`Cluster repair improved but did not finish for rooms [${repair.targetRooms.join(", ")}], remaining score=${repair.remainingScore}: ${repair.changes.map((change) => change.note).join("; ")}`)
            }
        }
    }

    const levelModel = loadLevelGridModel(resolvedPaths)
    const adjacency = analyzeAdjacencyConsistency(resolvedPaths)
    const unreachableByRoom = new Map<number, Array<{ floor: string, span: { startX: number, endX: number }, note: string }>>()
    const horizontalTraversalMismatchByRoom = new Map<number, Array<{ floor?: string, columns: number[] }>>()
    const unsafeHorizontalTransitionMismatchByRoom = new Map<number, Array<{ direction: string, floor?: string, columns: number[] }>>()
    const somersaultTunnelMismatchByRoom = new Map<number, Array<{ direction: string, floor?: string, columns: number[] }>>()
    const lethalSideExitMismatchByRoom = new Map<number, Array<{ direction: string, floor?: string, columns: number[] }>>()
    const verticalEdgeMismatchByRoom = new Map<number, Array<{ toRoom: number, columns: number[] }>>()
    const blockedTopClimbMismatchByRoom = new Map<number, Array<{ toRoom: number, columns: number[] }>>()
    const unsafeVerticalDropByRoom = new Map<number, Array<{ toRoom: number, columns: number[] }>>()
    const verticalFallMismatchByRoom = new Map<number, Array<{ toRoom: number, columns: number[] }>>()
    const lethalBottomMismatchByRoom = new Map<number, Array<{ columns: number[] }>>()
    const disconnectedVerticalPassageByRoom = new Map<number, Array<{ columns: number[] }>>()
    const globallyUnreachableRoomNotes = new Map<number, string>()
    const sparseRoomContentByRoom = new Map<number, string>()
    if (adjacency) {
        for (const issue of adjacency.unreachablePlatforms) {
            const roomIssues = unreachableByRoom.get(issue.room) || []
            roomIssues.push(issue)
            unreachableByRoom.set(issue.room, roomIssues)
        }
        for (const issue of adjacency.horizontalTraversalMismatches) {
            const roomIssues = horizontalTraversalMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ floor: issue.floor, columns: issue.columns || [] })
            horizontalTraversalMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.unsafeHorizontalTransitionMismatches) {
            const roomIssues = unsafeHorizontalTransitionMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ direction: issue.direction, floor: issue.floor, columns: issue.columns || [] })
            unsafeHorizontalTransitionMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.somersaultTunnelMismatches) {
            const roomIssues = somersaultTunnelMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ direction: issue.direction, floor: issue.floor, columns: issue.columns || [] })
            somersaultTunnelMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.lethalSideExitMismatches) {
            const roomIssues = lethalSideExitMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ direction: issue.direction, floor: issue.floor, columns: issue.columns || [] })
            lethalSideExitMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.verticalEdgeMismatches) {
            const roomIssues = verticalEdgeMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ toRoom: issue.toRoom, columns: issue.columns || [] })
            verticalEdgeMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.blockedTopClimbMismatches) {
            const roomIssues = blockedTopClimbMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ toRoom: issue.toRoom, columns: issue.columns || [] })
            blockedTopClimbMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.unsafeVerticalDrops) {
            const roomIssues = unsafeVerticalDropByRoom.get(issue.fromRoom) || []
            roomIssues.push({ toRoom: issue.toRoom, columns: issue.columns || [] })
            unsafeVerticalDropByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.verticalFallLandingMismatches) {
            const roomIssues = verticalFallMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ toRoom: issue.toRoom, columns: issue.columns || [] })
            verticalFallMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.lethalBottomPitMismatches) {
            const roomIssues = lethalBottomMismatchByRoom.get(issue.fromRoom) || []
            roomIssues.push({ columns: issue.columns || [] })
            lethalBottomMismatchByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.disconnectedVerticalPassages) {
            const roomIssues = disconnectedVerticalPassageByRoom.get(issue.fromRoom) || []
            roomIssues.push({ columns: issue.columns || [] })
            disconnectedVerticalPassageByRoom.set(issue.fromRoom, roomIssues)
        }
        for (const issue of adjacency.globallyUnreachableRooms) {
            globallyUnreachableRoomNotes.set(issue.room, issue.note)
        }
        for (const issue of adjacency.sparseRoomContentRooms) {
            sparseRoomContentByRoom.set(issue.room, issue.note)
        }
    }

    if (levelModel && adjacency) {
        console.log(`Adjacency Preflight For ${levelModel.levelName}:`)
        console.log(`  Rooms loaded: ${levelModel.roomsByNumber.size}`)
        console.log(`  Horizontal mismatches: ${adjacency.horizontalMismatches.length === 0 ? "none" : adjacency.horizontalMismatches.length}`)
        console.log(`  Horizontal entry traversal mismatches: ${adjacency.horizontalTraversalMismatches.length === 0 ? "none" : adjacency.horizontalTraversalMismatches.length}`)
        console.log(`  Unsafe horizontal room transitions: ${adjacency.unsafeHorizontalTransitionMismatches.length === 0 ? "none" : adjacency.unsafeHorizontalTransitionMismatches.length}`)
        console.log(`  Somersault tunnel mismatches: ${adjacency.somersaultTunnelMismatches.length === 0 ? "none" : adjacency.somersaultTunnelMismatches.length}`)
        console.log(`  Reachable open side exits without adjacency: ${adjacency.lethalSideExitMismatches.length === 0 ? "none" : adjacency.lethalSideExitMismatches.length}`)
        console.log(`  Vertical edge transition mismatches: ${adjacency.verticalEdgeMismatches.length === 0 ? "none" : adjacency.verticalEdgeMismatches.length}`)
        console.log(`  Open top climb columns without up exit: ${adjacency.blockedTopClimbMismatches.length === 0 ? "none" : adjacency.blockedTopClimbMismatches.length}`)
        console.log(`  Vertical fall landing mismatches: ${adjacency.verticalFallLandingMismatches.length === 0 ? "none" : adjacency.verticalFallLandingMismatches.length}`)
        console.log(`  Sparse room content: ${adjacency.sparseRoomContentRooms.length === 0 ? "none" : adjacency.sparseRoomContentRooms.length}`)
        console.log("")
    }

    for (const filePath of resolvedPaths) {
        if (!fs.existsSync(filePath)) {
            console.error(`Missing file: ${filePath}`)
            process.exitCode = 1
            continue
        }

        if (shouldFixTopFloorSupport) {
            const fix = fixMisalignedTopFloorSupport(filePath)
            if (fix.changed) {
                console.log(`Fixed top-floor support in ${filePath} at columns [${fix.changedColumns.join(", ")}]`)
            }
        }
        if (shouldFixOddSpanParity) {
            const fix = fixOddSolidRunParity(filePath)
            if (fix.changed) {
                console.log(`Fixed odd solid runs in ${filePath}: ${fix.changes.map((change) => `row${change.row}@x=${change.x}:${change.action}`).join(", ")}`)
            }
        }
        if (shouldFixOneStepObstacles) {
            const fix = fixOneStepObstacles(filePath)
            if (fix.changed) {
                console.log(`Fixed one-step obstacles in ${filePath}: ${fix.changes.map((change) => `x=${change.x}->y=${change.raisedToY}`).join(", ")}`)
            }
        }
        if (shouldFixEnclosedVoids) {
            const fix = fillEnclosedVoidRegions(filePath)
            if (fix.changed) {
                console.log(`Filled enclosed voids in ${filePath}: ${formatVoidRegions(fix.regions)}`)
            }
        }

        const analysis = analyzeGrid(filePath)
        console.log(`File: ${analysis.filePath}`)
        console.log(`Shape: ${analysis.width}x${analysis.height}${analysis.hasExpectedShape ? " (expected 16x7)" : " (unexpected; expected 16x7)"}`)
        console.log(`Values: ${analysis.uniqueValues.join(", ") || "none"}${analysis.hasOnlyBinaryValues ? "" : " (non-binary values present)"}`)
        console.log("Conrad stable standing/walking columns by floor:")
        for (const floor of analysis.floorAnalyses) {
            console.log(
                `  ${floor.rule.name.padEnd(6)} pos_y=${floor.rule.standingPosY} lane=${floor.rule.lane} clearance row ${floor.rule.clearanceRow} support row ${floor.rule.supportRow}` +
                ` -> columns [${formatSpans(floor.spans)}]`
            )
        }
        const oddSolidRows = analysis.oddSolidRunsByRow
            .map((spans, row) => spans.length === 0 ? null : `row ${row}: [${formatSpans(spans)}]`)
            .filter((line): line is string => Boolean(line))
        const fakeShelfRows = analysis.fakeShelfRunsByRow
            .map((spans, row) => spans.length === 0 ? null : `row ${row}: [${formatSpans(spans)}]`)
            .filter((line): line is string => Boolean(line))
        const nonWalkableTopSurfaceRows = analysis.nonWalkableTopSurfaceRunsByRow
            .map((spans, row) => spans.length === 0 ? null : `row ${row}: [${formatSpans(spans)}]`)
            .filter((line): line is string => Boolean(line))
        const somersaultTunnelIssues = analysis.somersaultTunnelIssues
            .map((issue) => `${issue.floor || `row${issue.row}`}:${issue.startX === issue.endX ? issue.startX : `${issue.startX}-${issue.endX}`} (${issue.note})`)
        console.log(`Even horizontal solid runs required: ${oddSolidRows.length === 0 ? "none" : oddSolidRows.join("; ")}`)
        console.log(`No fake unsupported shelves: ${fakeShelfRows.length === 0 ? "none" : fakeShelfRows.join("; ")}`)
        console.log(`No non-walkable top surfaces: ${nonWalkableTopSurfaceRows.length === 0 ? "none" : nonWalkableTopSurfaceRows.join("; ")}`)
        console.log(`Somersault tunnels valid: ${somersaultTunnelIssues.length === 0 ? "none" : somersaultTunnelIssues.join("; ")}`)
        console.log(`No 1-row stair-step obstacles: ${analysis.oneStepObstaclePairs.length === 0 ? "none" : analysis.oneStepObstaclePairs.map((pair) => `x${pair.leftX}-${pair.rightX}@y${pair.leftTopY}/${pair.rightTopY}`).join(", ")}`)
        console.log(`Enclosed cavities with no entrance: ${formatVoidRegions(analysis.enclosedVoidRegions)}`)
        console.log(`Top-floor support one row too low: [${formatSpans(analysis.misalignedTopFloor.spans)}]`)
        const hasAnyStandingSpace = analysis.floorAnalyses.some((floor) => floor.stableColumns.length > 0)
        const hasOddSolidRuns = analysis.oddSolidRunsByRow.some((spans) => spans.length > 0)
        const hasFakeShelves = analysis.fakeShelfRunsByRow.some((spans) => spans.length > 0)
        const hasNonWalkableTopSurfaces = analysis.nonWalkableTopSurfaceRunsByRow.some((spans) => spans.length > 0)
        const hasSomersaultTunnelIssues = analysis.somersaultTunnelIssues.length > 0
        const hasOneStepObstacles = analysis.oneStepObstaclePairs.length > 0
        const hasEnclosedVoids = analysis.enclosedVoidRegions.length > 0
        const unreachable = analysis.roomNumber !== null ? (unreachableByRoom.get(analysis.roomNumber) || []) : []
        const horizontalTraversalMismatches = analysis.roomNumber !== null ? (horizontalTraversalMismatchByRoom.get(analysis.roomNumber) || []) : []
        const unsafeHorizontalTransitionMismatches = analysis.roomNumber !== null ? (unsafeHorizontalTransitionMismatchByRoom.get(analysis.roomNumber) || []) : []
        const somersaultTunnelMismatches = analysis.roomNumber !== null ? (somersaultTunnelMismatchByRoom.get(analysis.roomNumber) || []) : []
        const lethalSideExitMismatches = analysis.roomNumber !== null ? (lethalSideExitMismatchByRoom.get(analysis.roomNumber) || []) : []
        const verticalEdgeMismatches = analysis.roomNumber !== null ? (verticalEdgeMismatchByRoom.get(analysis.roomNumber) || []) : []
        const blockedTopClimbMismatches = analysis.roomNumber !== null ? (blockedTopClimbMismatchByRoom.get(analysis.roomNumber) || []) : []
        const unsafeVerticalDrops = analysis.roomNumber !== null ? (unsafeVerticalDropByRoom.get(analysis.roomNumber) || []) : []
        const verticalFallMismatches = analysis.roomNumber !== null ? (verticalFallMismatchByRoom.get(analysis.roomNumber) || []) : []
        const lethalBottomMismatches = analysis.roomNumber !== null ? (lethalBottomMismatchByRoom.get(analysis.roomNumber) || []) : []
        const disconnectedVerticalPassages = analysis.roomNumber !== null ? (disconnectedVerticalPassageByRoom.get(analysis.roomNumber) || []) : []
        const globalReachabilityIssue = analysis.roomNumber !== null ? globallyUnreachableRoomNotes.get(analysis.roomNumber) : undefined
        const sparseRoomContentIssue = analysis.roomNumber !== null ? sparseRoomContentByRoom.get(analysis.roomNumber) : undefined
        if (unreachable.length === 0) {
            console.log("Reachability from room/adjacent room: all stable upper platforms connected")
        } else {
            console.log(`Reachability from room/adjacent room: CHECK [${unreachable.map((issue) => `${issue.floor}:${issue.span.startX === issue.span.endX ? issue.span.startX : `${issue.span.startX}-${issue.span.endX}`}`).join(", ")}]`)
        }
        if (horizontalTraversalMismatches.length === 0) {
            console.log("Horizontal entry traversal: none")
        } else {
            console.log(`Horizontal entry traversal: CHECK [${horizontalTraversalMismatches.map((issue) => `${issue.floor}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (unsafeHorizontalTransitionMismatches.length === 0) {
            console.log("Unsafe horizontal room transitions: none")
        } else {
            console.log(`Unsafe horizontal room transitions: CHECK [${unsafeHorizontalTransitionMismatches.map((issue) => `${issue.direction}:${issue.floor}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (somersaultTunnelMismatches.length === 0) {
            console.log("Somersault tunnel seam/length checks: none")
        } else {
            console.log(`Somersault tunnel seam/length checks: CHECK [${somersaultTunnelMismatches.map((issue) => `${issue.direction}:${issue.floor}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (lethalSideExitMismatches.length === 0) {
            console.log("No reachable open side exit without adjacency: none")
        } else {
            console.log(`No reachable open side exit without adjacency: CHECK [${lethalSideExitMismatches.map((issue) => `${issue.direction}:${issue.floor}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (verticalEdgeMismatches.length === 0) {
            console.log("Vertical edge transition match: none")
        } else {
            console.log(`Vertical edge transition match: CHECK [${verticalEdgeMismatches.map((issue) => `${issue.toRoom}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (blockedTopClimbMismatches.length === 0) {
            console.log("No open top climb columns without up exit: none")
        } else {
            console.log(`No open top climb columns without up exit: CHECK [${blockedTopClimbMismatches.map((issue) => `${issue.toRoom}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (unsafeVerticalDrops.length === 0) {
            console.log("Survivable vertical drops: none")
        } else {
            console.log(`Survivable vertical drops: CHECK [${unsafeVerticalDrops.map((issue) => `${issue.toRoom}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (verticalFallMismatches.length === 0) {
            console.log("Vertical fall landing alignment: none")
        } else {
            console.log(`Vertical fall landing alignment: CHECK [${verticalFallMismatches.map((issue) => `${issue.toRoom}:${issue.columns.join(",")}`).join("; ")}]`)
        }
        if (lethalBottomMismatches.length === 0) {
            console.log("No reachable open bottom span without down adjacency: none")
        } else {
            console.log(`No reachable open bottom span without down adjacency: CHECK [${lethalBottomMismatches.map((issue) => issue.columns.join(",")).join("; ")}]`)
        }
        if (disconnectedVerticalPassages.length === 0) {
            console.log("Connected vertical passage through rooms with up/down exits: none")
        } else {
            console.log(`Connected vertical passage through rooms with up/down exits: CHECK [${disconnectedVerticalPassages.map((issue) => issue.columns.join(",")).join("; ")}]`)
        }
        console.log(`Sparse room content: ${sparseRoomContentIssue ? `CHECK [${sparseRoomContentIssue}]` : "none"}`)
        console.log(`Global room reachability from start: ${globalReachabilityIssue ? `CHECK [${globalReachabilityIssue}]` : "connected"}`)
        console.log(`Heuristic validity: ${analysis.hasExpectedShape && analysis.hasOnlyBinaryValues && hasAnyStandingSpace && analysis.misalignedTopFloor.columns.length === 0 && !hasOddSolidRuns && !hasFakeShelves && !hasNonWalkableTopSurfaces && !hasSomersaultTunnelIssues && !hasOneStepObstacles && !hasEnclosedVoids && unreachable.length === 0 && horizontalTraversalMismatches.length === 0 && unsafeHorizontalTransitionMismatches.length === 0 && somersaultTunnelMismatches.length === 0 && lethalSideExitMismatches.length === 0 && verticalEdgeMismatches.length === 0 && blockedTopClimbMismatches.length === 0 && unsafeVerticalDrops.length === 0 && verticalFallMismatches.length === 0 && lethalBottomMismatches.length === 0 && disconnectedVerticalPassages.length === 0 && !sparseRoomContentIssue && !globalReachabilityIssue ? "PASS" : "CHECK"}`)
        console.log("")
    }

    if (adjacency) {
        console.log(`Adjacency consistency for ${adjacency.levelName}:`)
        if (adjacency.horizontalMismatches.length === 0) {
            console.log("  Horizontal mismatches: none")
        } else {
            console.log("  Horizontal mismatches:")
            for (const issue of adjacency.horizontalMismatches) {
                console.log(`    room ${issue.fromRoom} ${issue.direction === "right" ? "->" : "<-"} ${issue.toRoom} floor=${issue.floor}: ${issue.note}`)
            }
        }
        if (adjacency.horizontalTraversalMismatches.length === 0) {
            console.log("  Horizontal entry traversal mismatches: none")
        } else {
            console.log("  Horizontal entry traversal mismatches:")
            for (const issue of adjacency.horizontalTraversalMismatches) {
                console.log(`    room ${issue.fromRoom} ${issue.direction === "right" ? "right" : "left"} floor=${issue.floor} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.unsafeHorizontalTransitionMismatches.length === 0) {
            console.log("  Unsafe horizontal room transitions: none")
        } else {
            console.log("  Unsafe horizontal room transitions:")
            for (const issue of adjacency.unsafeHorizontalTransitionMismatches) {
                console.log(`    room ${issue.fromRoom} ${issue.direction === "right" ? "right" : "left"} floor=${issue.floor} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.somersaultTunnelMismatches.length === 0) {
            console.log("  Somersault tunnel mismatches: none")
        } else {
            console.log("  Somersault tunnel mismatches:")
            for (const issue of adjacency.somersaultTunnelMismatches) {
                console.log(`    room ${issue.fromRoom} ${issue.direction === "right" ? "right" : "left"} floor=${issue.floor} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.lethalSideExitMismatches.length === 0) {
            console.log("  Reachable open side exits without adjacency: none")
        } else {
            console.log("  Reachable open side exits without adjacency:")
            for (const issue of adjacency.lethalSideExitMismatches) {
                console.log(`    room ${issue.fromRoom} ${issue.direction} floor=${issue.floor} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.verticalWarnings.length === 0) {
            console.log("  Vertical heuristic warnings: none")
        } else {
            console.log("  Vertical heuristic warnings:")
            for (const issue of adjacency.verticalWarnings) {
                console.log(`    room ${issue.fromRoom} ${issue.direction}-> ${issue.toRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.verticalEdgeMismatches.length === 0) {
            console.log("  Vertical edge transition mismatches: none")
        } else {
            console.log("  Vertical edge transition mismatches:")
            for (const issue of adjacency.verticalEdgeMismatches) {
                console.log(`    room ${issue.fromRoom} up-> ${issue.toRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.blockedTopClimbMismatches.length === 0) {
            console.log("  Open top climb columns without up exit: none")
        } else {
            console.log("  Open top climb columns without up exit:")
            for (const issue of adjacency.blockedTopClimbMismatches) {
                console.log(`    room ${issue.fromRoom} up-> ${issue.toRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.unsafeVerticalDrops.length === 0) {
            console.log("  Survivable vertical drops: none")
        } else {
            console.log("  Survivable vertical drops:")
            for (const issue of adjacency.unsafeVerticalDrops) {
                console.log(`    room ${issue.fromRoom} down-> ${issue.toRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.verticalFallLandingMismatches.length === 0) {
            console.log("  Vertical fall landing mismatches: none")
        } else {
            console.log("  Vertical fall landing mismatches:")
            for (const issue of adjacency.verticalFallLandingMismatches) {
                console.log(`    room ${issue.fromRoom} down-> ${issue.toRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.lethalBottomPitMismatches.length === 0) {
            console.log("  Reachable open bottom spans without down adjacency: none")
        } else {
            console.log("  Reachable open bottom spans without down adjacency:")
            for (const issue of adjacency.lethalBottomPitMismatches) {
                console.log(`    room ${issue.fromRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.disconnectedVerticalPassages.length === 0) {
            console.log("  Disconnected vertical passages: none")
        } else {
            console.log("  Disconnected vertical passages:")
            for (const issue of adjacency.disconnectedVerticalPassages) {
                console.log(`    room ${issue.fromRoom} cols=[${issue.columns?.join(", ") || ""}]: ${issue.note}`)
            }
        }
        if (adjacency.unreachablePlatforms.length === 0) {
            console.log("  Unreachable stable upper platforms: none")
        } else {
            console.log("  Unreachable stable upper platforms:")
            for (const issue of adjacency.unreachablePlatforms) {
                console.log(`    room ${issue.room} floor=${issue.floor} span=${issue.span.startX === issue.span.endX ? issue.span.startX : `${issue.span.startX}-${issue.span.endX}`}: ${issue.note}`)
            }
        }
        if (adjacency.globallyUnreachableRooms.length === 0) {
            console.log(`  Global reachability from start room ${adjacency.traversalStartRoom ?? "?"}: all active rooms reachable`)
        } else {
            console.log(`  Global reachability from start room ${adjacency.traversalStartRoom ?? "?"}:`)
            for (const issue of adjacency.globallyUnreachableRooms) {
                console.log(`    room ${issue.room}: ${issue.note}`)
            }
        }
        if (adjacency.sparseRoomContentRooms.length === 0) {
            console.log("  Sparse room content: none")
        } else {
            console.log("  Sparse room content:")
            for (const issue of adjacency.sparseRoomContentRooms) {
                console.log(`    room ${issue.room}: ${issue.note}`)
            }
        }
        console.log("")
    }
}

main()
