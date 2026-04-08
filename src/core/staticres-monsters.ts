import { uint8Max } from './game_constants'

type Monster = {
    monsterScriptNodeIndex: number,
    id:number,
    name:string
    palette:Uint8Array
}

function createMonster(
    monsterScriptNodeIndex: number,
    id: number,
    name: string,
    palette: Uint8Array
): Monster {
    return {
        monsterScriptNodeIndex,
        id,
        name: name,
        palette: palette
    };
}

type MonsterList = Monster[];

// color palettes for monsters
const _monsterPals = [
    Uint8Array.from([ // junkie
        0x00, 0x00, 0xAA, 0x0A, 0x65, 0x0A, 0x44, 0x08, 0x22, 0x06, 0x20, 0x03, 0x40, 0x05, 0x87, 0x0C,
        0x76, 0x0B, 0x34, 0x03, 0x55, 0x09, 0x30, 0x04, 0x60, 0x07, 0x55, 0x04, 0x77, 0x07, uint8Max, 0x0F
    ]),
    Uint8Array.from([ // mercenaire
        0x00, 0x00, 0x86, 0x0C, 0x66, 0x09, 0x44, 0x08, 0xFC, 0x05, 0xA2, 0x02, 0x49, 0x05, 0x02, 0x00,
        0x14, 0x02, 0x37, 0x04, 0x25, 0x03, 0x38, 0x06, 0xAF, 0x0C, 0x6F, 0x09, 0x4C, 0x07, uint8Max, 0x0F
    ]),
    Uint8Array.from([ // replicant
        0x00, 0x00, 0x79, 0x08, 0x44, 0x05, 0x55, 0x06, 0x66, 0x0B, 0x46, 0x05, 0x57, 0x06, 0x22, 0x03,
        0x44, 0x08, 0x33, 0x04, 0xAC, 0x08, 0x8A, 0x06, 0x68, 0x04, 0x56, 0x02, 0x35, 0x02, 0xCE, 0x0A
    ]),
    Uint8Array.from([ // glue
        0x00, 0x00, 0x6C, 0x00, 0x39, 0x02, 0x4C, 0x02, 0x27, 0x02, 0x10, 0x07, 0x15, 0x01, 0x00, 0x04,
        0x10, 0x05, 0x20, 0x08, 0x00, 0x02, 0x30, 0x09, 0x55, 0x0B, uint8Max, 0x0F, 0x33, 0x0A, uint8Max, 0x0F
    ])
]
const monsterListsByLevel: MonsterList[] = [
    /*level0*/[
        createMonster(34,0,'junky',_monsterPals[0]),
        createMonster(35,0,'junky',_monsterPals[0])
    ],
    /*level1*/[
        createMonster(34,0,'junky',_monsterPals[0]),
        createMonster(35,0,'junky',_monsterPals[0]),
        createMonster(75,0,'junky',_monsterPals[0]),
        createMonster(73,1,'mercenai',_monsterPals[1]),
        createMonster(77,1,'mercenai',_monsterPals[1]),
        createMonster(118,2,'replican',_monsterPals[2])
    ],
    /*level2*/[
        createMonster(118,2,'replican',_monsterPals[2])
    ],
    /*level3*/	[
        createMonster(77,1,'mercenai',_monsterPals[1]),
        createMonster(118,2,'replican',_monsterPals[2])
    ],
    /*level4*/	[
        createMonster(118,2,'replican',_monsterPals[2]),
        createMonster(172,2,'replican',_monsterPals[2]),
        createMonster(215,3,'glue',_monsterPals[3]),
    ],
    /*level5*/	[
        createMonster(176,3,'glue',_monsterPals[3]),
        createMonster(215,3,'glue',_monsterPals[3]),
    ],
    /*level6*/	[
        createMonster(176,3,'glue',_monsterPals[3]),
        createMonster(215,3,'glue',_monsterPals[3]),
        createMonster(216,3,'glue',_monsterPals[3]),
    ],
    /*slot7 (level10)*/ [
        createMonster(34,0,'junky',_monsterPals[0]),
        createMonster(35,0,'junky',_monsterPals[0])
    ]

]

export { Monster, monsterListsByLevel};
