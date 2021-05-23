const stream = require("./stream")
const axios = require("axios")
const EventSource = require("eventsource")

class FacebookTargetedMessagePublisher extends stream.AbstractTargetedMessagePublisher {
    constructor(client) {
        super()
        this.client = client
    }

    async sendMessage(message, ctx) {
        await this.client.postComment(message, ctx.threadId)
    }
}

class FacebookStream extends stream.AbstractStream {
    constructor(fbAuth) {
        super()

        if (!fbAuth) {
            throw new Error(
                "Must define fbAuth to start a facebook stream chat"
            )
        }

        // Define configuration options

        const opts = {
            oauthToken: fbAuth.oauthToken,
            pageId: fbAuth.pageId
        }

        this.client = new FacebookChat(opts)

        this.onMessageHandler = this.onMessageHandler.bind(this)
        this.client.onMessage(this.onMessageHandler)
    }

    listen() {
        this.client.connect()
    }

    async poke() {
        if (this.client.liveVideo) {
            await this.client.postComment("healthcheck probe")
            return true
        }
        throw "Facebook client is not connected."
    }

    onMessageHandler(payload) {
        const { id, name } = payload.from
            ? payload.from
            : { id: 0, name: "_NO_NAME_" }
        const ctx = {
            threadId: payload.id,
            author: {
                id,
                displayName: name
            }
        }
        console.debug(
            `FB: ${ctx.author.displayName} says "${payload.message}" (${ctx.threadId})`
        )

        const publisher = new FacebookTargetedMessagePublisher(this.client)

        this.notifyListeners(payload.message, publisher, ctx)
    }
}

class FacebookChat {
    constructor({ oauthToken, pageId }) {
        this.pageId = pageId
        this.oauthToken = oauthToken
    }

    onMessage(fn) {
        this.onMessageHandler = fn
    }
    async getActiveLiveVideo(retries, sleep = 30000) {
        let attempt = 0
        while (!retries || retries < 0 || attempt <= retries) {
            const apiResponse = await axios.get(
                `https://graph.facebook.com/v10.0/${this.pageId}/live_videos?fields=status,id,permalink_url&access_token=${this.oauthToken}`
            )
            if (!(apiResponse.status == 200 && apiResponse.data.data)) {
                throw `Facebook API did not return the data we wanted.\nStatus:${apiResponse.status}\nData:${apiResponse.data}`
            }

            const activeLiveVideos = apiResponse.data.data.filter(
                video => video.status == "LIVE"
            )

            if (activeLiveVideos.length > 0) {
                return activeLiveVideos.pop()
            }
            console.warn(
                `FB: Unable to detect a facebook live video, retrying in ${sleep /
                    1000} seconds.`
            )
            await new Promise(resolve => setTimeout(resolve, sleep))
            attempt = attempt + 1
        }
        throw "Could not find an active live video within the timeout."
    }

    async connect() {
        this.liveVideo = await this.getActiveLiveVideo(-1)
        console.log(
            `FB: * Detected Live Video! * Video ID: ${this.liveVideo.id}`
        )

        var source = new EventSource(
            `https://streaming-graph.facebook.com/${this.liveVideo.id}/live_comments?access_token=${this.oauthToken}&fields=from{name,id},message,attachment,message_tags,created_time,application&comment_rate=one_hundred_per_second&live_filter=no_filter`
        )
        source.onmessage = event => {
            if (event.type != "message") {
                console.error(`FB ERROR: Got an event of type ${event.type}.`)
                return
            }
            if (!event.data) {
                console.error(
                    `FB ERROR: Event did not contain any data: ${event}`
                )
            }

            const payload = JSON.parse(event.data)
            this.onMessageHandler(payload)
        }

        source.addEventListener("error", function(e) {
            if (e.readyState == EventSource.CLOSED) {
                console.error("Connection was closed! ", e)
            } else {
                console.error("An unknown error occurred: ", e)
            }
        })
        const liveCheck = async () => {
            try {
                const activeLive = await this.getActiveLiveVideo(1, 10)
                if (
                    activeLive &&
                    activeLive.id === this.liveVideo.id &&
                    source.readyState == EventSource.OPEN
                ) {
                    // live is still active. reschedule check.
                    return setTimeout(liveCheck, 30000)
                }
            } catch (e) {
                console.error("Live video no longer detected.", activeLive)
                try {
                    console.log("Closing the event source.")
                    source.close()
                } catch (e) {
                    // ignore
                }
                console.error("Resetting FB connection loop.")
                this.liveVideo = null
                setTimeout(this.connect, 1)
            }
        }
        // Setup a healthcheck
        setTimeout(liveCheck, 30000)
    }

    async postComment(message, threadId) {
        if (!threadId) {
            const videoUrlId = this.liveVideo.permalink_url.split("/")[3]
            threadId = `${this.pageId}_${videoUrlId}`
        }

        const postUrl = `https://graph.facebook.com/v10.0/${threadId}/comments?access_token=${this.oauthToken}`
        const payload = {
            message,
            id: threadId,
            pageAuthToken: this.oauthToken
        }
        try {
            await axios.post(postUrl, payload)
        } catch (e) {
            console.error("Could not post the comment.")
            console.error(e)
            throw e
        }
    }
}
module.exports = FacebookStream
