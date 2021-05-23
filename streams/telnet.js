const stream = require("./stream")
const telnetlib = require("telnetlib")

class TelnetTargetedMessagePublisher extends stream.AbstractTargetedMessagePublisher {
    constructor(client) {
        super()
        this.client = client
    }

    sendMessage(message) {
        console.log(`TelnetStream output: ${message}`)
    }

    async sendMessage(message, ctx) {
        this.client.write(`${message}\n`)
    }
}

class TelnetStream extends stream.AbstractStream {
    constructor(port) {
        super()
        this.port = port
        this.client = null
        this.onMessageHandler = this.onMessageHandler.bind(this)
        this.server = telnetlib.createServer({}, client => {
            this.client = client

            // listen for the actual data from the client
            this.client.on("data", b => {
                this.onMessageHandler(b.toString("utf8").trim())
            })

            this.client.on("negotiated", () =>
                this.client.write("Connected.\n")
            )
        })
    }

    onMessageHandler(message) {
        const publisher = new TelnetTargetedMessagePublisher(this.client)
        this.notifyListeners(message, publisher, {})
    }

    listen() {
        console.log(`TELNET: Starting telnet server on port ${this.port}`)
        this.server.listen(this.port)
    }

    async poke() {
        if (this.client) {
            this.client.write("healthcheck poke\n")
            return true
        } else {
            throw "Client is not initialized."
        }
    }

    getChatMessage() {
        this.notifyListeners(this.command, new TelnetTargetedMessagePublisher())
    }
}

module.exports = TelnetStream
