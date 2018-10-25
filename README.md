# zachDiscordBot
A Discord bot that I use on my Discord server.

It's a useful bot. For me. Maybe it's also useful for my friends?

Perhaps you'll find it useful as a starting point for your own bot.

## Prerequisites
1. [NodeJS v8](https://nodejs.org/en/)
    - NodeJS versions 9+ don't work with the `!sbv` command with `discord.js` v11 - supposedly this is fixed in `discord.js` v12
2. A Discord account
3. A Discord bot token
    - Use a [guide like this](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) if you don't know what this means.
4. A YouTube API token
    - You can get one of those via the [Google Developer Console](https://console.developers.google.com/apis/api/youtube.googleapis.com/credentials).

## Installation
1. Clone this repo
2. Rename `authTemplate.json` to `auth.json`
3. Inside `auth.json`, replace `YOUR_DISCORD_BOT_TOKEN_HERE` with your Discord bot token
4. Inside `auth.json`, replease `YOUR_YOUTUBE_API_TOKEN_HERE` with your YouTube API token
5. Run `npm install` from a command prompt in your repo directory
    - If you get an error about python, make sure you have Python 2.7 installed and set in PATH (or use `npm config set python <path to python.exe>`)
6. Run `node ./zachBot.js` from a command prompt in your repo directory
7. Celebrate and enjoy this cool bot 🎉

## Code
Have a look through `zachBot.js` if you're curious about how this bot works. All of the code is commented quite thoroughly.

## Commands
`zachBot` (`🤖 sup`) currently supports the following commands:

- `!<help|commands|halp>`
    - Displays some helpful info.
- `!y <YouTube search query in \"QUOTES\"|link to YouTube video>`
    - Adds a YouTube video's audio to the YouTube playlist. See `!yp` command details below for more about playlist commands.
    - If no audio is currently playing, the bot will start autoplaying the video you just added.
- `!yp <list|next|back|clear>` OR `!yp del <index to delete>` OR `!yp repeat <(optional) none|one|all>`
    - `!yp list` will list all of the videos in the YouTube playlist and show a `🎶` next to the video that's currently playing.
    - `!yp next` will skip forwards to the next video in the YouTube playlist, if one exists.
    - `!yp back` will skip backwards to the previous video in the YouTube playlist, if one exists.
    - `!yp clear` will clear the YouTube playlist and stop any currently-playing video.
    - `!yp del <index to delete>` will delete the specified video from the YouTube playlist.
        - If a user specified the index of the video that's currently playing, that video will stop. If, then, there's a video next in the playlist, that will start playing automatically.
    - `!yp repeat` will list the current YouTube playlist repeat mode.
    - `!yp repeat <none|one|all>` will change the YouTube playlist repeat mode.
- `!v <pause|resume>` OR `!v vol <(optional) volume value>`
    - `!v pause` will pause the whatever audio the bot is currently playing in its voice channel (which could be a YouTube video or a `!sbv` voice clip)
    - `!v resume` will resume whatever audio the bot has paused
    - `!v vol` will list the bot's current voice channel volume
    - `!v vol <volume value>` will change the bot's voice channel volume. This value will persist between clips. You can set the volume before the bot has even started playing audio or joined a voice channel.
- `!e <emoji name>`
    - Displays an emoji image from `./bigEmoji/` corresponding to the argument to this command.
    - See [`./bigEmoji/README.md`](./bigEmoji/README.md) for more info on adding emojis to the bot's repository.
    - Example: The bot would respond to `!e hello` with a message containing `./bigEmoji/hello.png`
- `!sb <sound ID> <(optional) person>`
    - Uploads a sound file from `./sounds/` corresponding to the argument(s) to this command. The sound file is embedded into the message and playable by desktop users of Discord with a nifty play button.
    - See [`./sounds/README.md`](./sounds/README.md) for more info on adding sounds to the bot's repository.
    - Example: The bot would respond to `!sb goodbye` with a message containing `./sounds/goodbye.mp3`
- `!sbv <sound ID> <(optional) person>`
    - Joins the voice channel that the user who initiated this command is in, plays (over the voice channel) the sound file from `./sounds/` corresponding to the argument(s) to this command, then leaves the voice channel.
    - See [`./sounds/README.md`](./sounds/README.md) for more info on adding sounds to the bot's repository.
    - Example: If I was in the voice channel "General", the bot would respond to `!sbv goodbye` by joining "General", playing `./sounds/goodbye.mp3`, then leaving the voice channel.
- `!soundStats <*|(optional) sound ID> <(optional) person>`
    - No arguments to this means the bot will display the top 10 most requested sounds.
    - A `sound ID` argument to this means the bot will display stats data about sounds with that ID said by everyone who said it.
    - A `*` supplied as the `sound ID` argument will display stats data about all of a specific `person`'s sounds.
    - A `sound ID` and `person` argument will display stats about a soundID said by a specific person.
- `!leave`
    - Forces the bot to leave the voice channel that it's currently in. Useful if someone plays a really long sound with `!sbv` and you hate it and want them to stop and you secretly have a deep dislike for the person who used the command but you don't really want to resolve that so you just sorta keep it to yourself.
- `!quote` OR `!quote delete <quoteID>`
    - This one is the most complicated.
    - To start adding a quote to the database, react to a message in your channel with the 🔠 emoji. You'll then see further instructions.
        - When the bot starts up, it will cache the last 50 messages in each channel. `discord.js` automatically caches messages it can read after it starts up. Users can only add cached messages to quotes.
    - You can use `!quote <(optional) quoteID>` to display a random or specified quote from the bot's quote database. A user will only get quotes from the server and channel in which the user invoked this command.
    - You can use `!quote delete <quoteID>` to delete a quote from the bot's quote database. A user can only delete a quote from the DB if they're in the server and channel associated with that quote ID.
