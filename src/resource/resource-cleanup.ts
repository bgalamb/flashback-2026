import { ObjectType } from './constants'
import { ResourceLevelState, ResourceTextState } from './resource-state'

function unloadResourceType(textState: ResourceTextState, objType: number) {
    switch (objType) {
        case ObjectType.OT_CMD:
            textState.cmd = null
            break
        case ObjectType.OT_POL:
            textState.pol = null
            break
        case ObjectType.OT_CMP:
            textState.cmd = null
            textState.pol = null
            break
        default:
            console.error(`Unimplemented Resource::unload() type ${objType}`)
            break
    }
}

function freeObjectNodes(levelState: ResourceLevelState) {
    let prevNode = null
    for (let i = 0; i < levelState.numObjectNodes; ++i) {
        if (levelState.objectNodesMap[i] !== prevNode) {
            const curNode = levelState.objectNodesMap[i]
            curNode.objects.length = 0
            prevNode = curNode
        }
        levelState.objectNodesMap[i] = null
    }
}

function clearLevelResourceState(levelState: ResourceLevelState) {
    levelState.tbn = []
    levelState.mbk = null
    levelState.pal = null
    levelState.bnq = null
    levelState.ani = null
    freeObjectNodes(levelState)
}

export {
    clearLevelResourceState,
    freeObjectNodes,
    unloadResourceType,
}
