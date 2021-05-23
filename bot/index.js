const ActionSwitcher = require("../actions/actionSwitcher")

class StreamBot {
    constructor({ streams = [], actions = [], config = {} }) {
        this.messageHandler = this.messageHandler.bind(this)
        this.started = false
        this.config = config
        this.streams = []
        this.actions = []
        this.addStreams(...streams)
        this.addActions(...actions)
    }

    addStreams(...streams) {
        if (this.started) {
            throw "Can't add streams once the bot is started."
        }
        streams.forEach(s => {
            console.log(`* Configuring stream: ${s.constructor.name}`)
            s.addMessageHandler(this.messageHandler)
        })
        this.streams = [...this.streams, ...streams]
    }

    addActions(...actions) {
        if (this.started) {
            throw "Can't add actions once the bot is started."
        }
        actions.forEach(a =>
            console.log(`* Configuring action: ${a.constructor.name}`)
        )

        this.actions = [...this.actions, ...actions]
    }

    start() {
        this.actionSwitcher = new ActionSwitcher(this.actions, {
            blacklisted: this.config.blacklistedActions
        })
        this.streams.forEach(s => s.listen())
        this.started = true
        console.log("* StreamBot is listening")
    }

    async poke() {
        const pokeResult = {}
        for (let stream of this.streams) {
            try {
                pokeResult[stream.constructor.name] = await stream.poke()
            } catch (e) {
                pokeResult[stream.constructor.name] = e.message
            }
        }
        return pokeResult
    }

    async messageHandler(message, publisher, ctx) {
        const trimmedMessage = message.trim()
        const messages = await this.actionSwitcher.getMessages(
            trimmedMessage,
            ctx
        )
        messages.forEach(async m => await publisher.sendMessage(m, ctx))
    }
}

module.exports = StreamBot
