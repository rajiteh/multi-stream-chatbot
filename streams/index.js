const DummyStream = require("./dummy")
const TwitchStream = require("./twitch")
const YoutubeStream = require("./youtube")
const FacebookStream = require("./facebook")
const TelnetStream = require("./telnet")

const { AbstractStream, AbstractTargetedMessagePublisher } = require("./stream")

module.exports = {
    DummyStream,
    TwitchStream,
    YoutubeStream,
    FacebookStream,
    TelnetStream,
    AbstractStream,
    AbstractTargetedMessagePublisher
}
