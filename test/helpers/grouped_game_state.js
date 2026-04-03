function defineGroupedAccessors(game, targetKey, fields) {
    game[targetKey] = {}
    for (const [field, backingKey] of Object.entries(fields)) {
        Object.defineProperty(game[targetKey], field, {
            enumerable: true,
            get() {
                return game[backingKey]
            },
            set(value) {
                game[backingKey] = value
            },
        })
    }
}

function attachGroupedGameState(game, groups) {
    for (const [targetKey, fields] of Object.entries(groups)) {
        defineGroupedAccessors(game, targetKey, fields)
    }
    return game
}

module.exports = {
    attachGroupedGameState,
}
