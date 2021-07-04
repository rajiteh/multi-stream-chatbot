const stream = require("./stream")
const axios = require("axios")
const EventSource = require("eventsource")
const events = require('events')

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
    constructor(fbAuth, onConnect = () => { }) {
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
        this.client.onConnect(onConnect)
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
        console.log(
            `${ctx.author.displayName} says "${payload.message}" (${ctx.threadId})`
        )

        const publisher = new FacebookTargetedMessagePublisher(this.client)

        this.notifyListeners(payload.message, publisher, ctx)
    }

}

class FacebookChat {
    constructor({ oauthToken, pageId }) {
        this.pageId = pageId
        this.oauthToken = oauthToken
        this.clientEvents = new events.EventEmitter();
    }

    onMessage(fn) {
        this.onMessageHandler = fn
    }

    onConnect(fn) {
        this.onConnectHandler = fn
    }


    log(...message) {
        console.log(`FB: `, ...message)
    }

    async getActiveLiveVideo() {
        this.log(`Looking for live videos.`)
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
        } else {
            throw `No active live video found.`
        }
    }

    async connect() {
        try {
            const activeLive = await this.getActiveLiveVideo()
            if (
                !(this.liveVideo && this.source) || // if we don't have a livevideo or a source configured 
                (activeLive.id !== this.liveVideo.id) || // if the new live id is different from the existing one
                this.source.readyState != EventSource.OPEN // if the event source has got closed
            ) {
                await this.setupSession(activeLive)
                this.log("Live session setup.")
            } else {
                // TODO: Remove this line. 
                // this.log("Session is ok.")
            }
        } catch (e) {
            this.log("There was an issue detecting and or configuring the live.")
            console.error(e)
            this.liveVideo = null
        } finally {
            // Check back in a bit to make sure the video is still alive..
            setTimeout(this.connect.bind(this), 30000)
        }
    }
    async setupSession(liveVideo) {
        this.liveVideo = liveVideo

        this.log(
            `Detected Video ID: ${this.liveVideo.id}`
        )

        // Make sure the source is closed
        if (this.source) {
            try {
                this.source.close()
            } catch (e) {
                // ignore
            }
            this.source = undefined
        }

        this.source = new EventSource(
            `https://streaming-graph.facebook.com/${this.liveVideo.id}/live_comments?access_token=${this.oauthToken}&fields=from{name,id},message,attachment,message_tags,created_time,application&comment_rate=one_hundred_per_second&live_filter=no_filter`
        )

        this.source.onmessage = event => {
            if (event.type != "message") {
                this.log(`ERROR: Got an event of type ${event.type}.`)
                return
            }
            if (!event.data) {
                this.log(
                    `ERROR: Event did not contain any data: ${event}`
                )
            }

            const payload = JSON.parse(event.data)
            this.onMessageHandler(payload)
        }

        this.source.addEventListener("error", function (e) {
            if (e.readyState == EventSource.CLOSED) {
                this.log("Connection was closed! ", e)
            } else {
                this.log("An unknown error occurred: ", e)
            }
        })

        // emit the onConnect event
        if (this.onConnect) {
            this.log("Executing the onconnect")
            this.onConnectHandler(this)
        }
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
            this.log("Could not post the comment.")
            console.error(e)
            throw e
        }
    }
}
module.exports = FacebookStream
