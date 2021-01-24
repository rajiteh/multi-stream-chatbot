const stream = require("./stream")
const axios = require("axios")
const EventSource = require("eventsource")


class FacebookTargetedMessagePublisher extends stream.AbstractTargetedMessagePublisher {
    constructor(client) {
        super()
        this.client = client
    }

    async sendMessage(message) {
        console.warn("* Facebook message publishing is not implemented", message)
    }
}

class FacebookStream extends stream.AbstractStream {
    constructor(fbAuth) {
        super()

        if (!fbAuth) {
            throw new Error("Must define fbAuth to start a facebook stream chat")
        }

        // Define configuration options
        
        const opts = {
            oauthToken: fbAuth.oauthToken,
            pageId: fbAuth.pageId,
        }

        this.client = new FacebookChat(opts)

        this.onMessageHandler = this.onMessageHandler.bind(this)
        this.client.onMessage(this.onMessageHandler)

    }

    listen() {
        this.client.connect()
    }

    onMessageHandler(payload) {
        const {id, name} = payload.from ? payload.from : {id: 0, name: "no name"}
        const ctx = {
            author: {
                id,
                displayName: name
            }
        }
        console.debug(`FB CHAT: ${ctx.author.displayName} says "${payload.message}"`)

        const publisher = new FacebookTargetedMessagePublisher(this.client)

        this.notifyListeners(payload.message, publisher, ctx)
    }


}


class FacebookChat {

    constructor({oauthToken, pageId}) {
        this.pageId = pageId
        this.oauthToken = oauthToken
        
    }

    onMessage(fn) {
        this.onMessageHandler = fn
    }
    async getActiveLiveVideo(retries) {
        let attempt = 0
        while (!retries || retries < 0 || attempt <= retries) {
            const apiResponse = await axios.get(`https://graph.facebook.com/v8.0/${this.pageId}/live_videos?access_token=${this.oauthToken}`)
            if (!(apiResponse.status == 200 && apiResponse.data.data)) {
                throw `Facebook API did not return the data we wanted.\nStatus:${apiResponse.status}\nData:${apiResponse.data}`
            }

            const activeLiveVideos = apiResponse.data.data.filter((video) => video.status == 'LIVE')

            if (activeLiveVideos.length > 0) {
                return activeLiveVideos.pop()
            }
            console.warn("FB: Unable to detect a facebook live video, retrying in 30 seconds.")
            await new Promise(resolve => setTimeout(resolve, 30000));
            attempt = attempt + 1
        }
        throw "Could not find an active live video within the timeout."
        
    } 

    async connect() {

        const liveVideo = await this.getActiveLiveVideo(-1)

        this.videoId = liveVideo.id
        console.log(`FB: WE be connecting YO! Using video ID: ${this.videoId}`)
        var source = new EventSource(`https://streaming-graph.facebook.com/${this.videoId}/live_comments?access_token=${this.oauthToken}&comment_rate=one_per_two_seconds&fields=from{name,id},message`);
        source.onmessage = (event) => {
            if (event.type != 'message') {
                console.error(`FB ERROR: Got an event of type ${event.type}.`)
                return
            }
            if (!event.data) {
                console.error(`FB ERROR: Event did not contain any data: ${event}`)
            }

            
            const payload = JSON.parse(event.data)
            this.onMessageHandler(payload)
        };

    }


}
module.exports = FacebookStream
