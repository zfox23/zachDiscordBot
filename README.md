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

## Installation
1. Clone this repo
2. Rename `authTemplate.json` to `auth.json`
3. Inside `auth.json`, replace `YOUR_DISCORD_BOT_TOKEN_HERE` with your, uh, Discord bot token
4. Run `npm install` from a command prompt in your repo directory
5. Run `npm ./zachBot.js` from a command prompt in your repo directory
6. Celebrate and enjoy this cool bot 🎉

## Code
Have a look through `zachBot.js` if you're curious about how this bot works. All of the code is commented quite thoroughly.

## Commands
`zachBot` (`🤖 sup`) currently supports the following commands:

- `!<help|commands|halp>`
    - Displays some helpful info.
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
    - You can use `!quote <(optional) quoteID>` to display a random or specified quote from the bot's quote database. A user will only get quotes from the server and channel in which the user invoked this command.
    - You can use `!quote delete <quoteID>` to delete a quote from the bot's quote database. A user can only delete a quote from the DB if they're in the server and channel associated with that quote ID.
