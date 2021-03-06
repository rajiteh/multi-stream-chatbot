const stream = require("./stream")
const tmi = require("tmi.js")
const MessageFormatter = require("../util/messageFormatter")

TWITCH_MAX_MESSAGE_LENGTH = 500

class TwitchTargetedMessagePublisher extends stream.AbstractTargetedMessagePublisher {
    constructor(client, target) {
        super()

        this.client = client
        this.target = target
    }

    sendMessage(message) {
        MessageFormatter.createMessageParts(
            message,
            TWITCH_MAX_MESSAGE_LENGTH
        ).forEach(messagePart => {
            this.client.say(this.target, messagePart)
        })
    }
}

class TwitchStream extends stream.AbstractStream {
    constructor(twitchAuth, { customClientOpts = {} } = {}) {
        super()

        if (!twitchAuth) {
            throw new Error("Must define twitchAuth to start a twitch stream")
        }

        // Define configuration options

        const opts = {
            identity: {
                username: twitchAuth.botUsername,
                password: twitchAuth.oauthToken
            },
            channels: [twitchAuth.channel],
            options: { debug: true },
            ...customClientOpts
        }

        this.twitchChannel = twitchAuth.channel

        // Bind class methods
        this.onMessageHandler = this.onMessageHandler.bind(this)
        this.onConnectedHandler = this.onConnectedHandler.bind(this)

        // Create a client with our options
        this.client = new tmi.client(opts)
        this.client.on("message", this.onMessageHandler)
        this.client.on("connected", this.onConnectedHandler)
    }

    listen() {
        this.client.connect()
    }

    async poke() {
        if (this.client && this.connected) {
            await this.client.say(this.twitchChannel, "poke")
            return true
        }
        throw new Error("Twitch client is not connected.")
    }

    onMessageHandler(target, context, msg, self) {
        // Ignore messages from the bot
        if (self) {
            return
        }

        const safeCtx = context || {}

        const ctx = {
            author: {
                id: safeCtx["username"],
                displayName: safeCtx["display-name"]
            }
        }

        const publisher = new TwitchTargetedMessagePublisher(
            this.client,
            target
        )
        this.notifyListeners(msg, publisher, ctx)
    }

    onConnectedHandler(addr, port) {
        console.log(`* Connected to ${addr}:${port}`)
        this.connected = true
    }
}

module.exports = TwitchStream
