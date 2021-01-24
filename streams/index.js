const DummyStream = require("./dummy")
const TwitchStream = require("./twitch")
const YoutubeStream = require("./youtube")
const FacebookStream = require("./facebook")

const { AbstreamStream, AbstractTargetedMessagePublisher } = require("./stream")

module.exports = {
    DummyStream,
    TwitchStream,
    YoutubeStream,
    FacebookStream,
    AbstreamStream,
    AbstractTargetedMessagePublisher
}
