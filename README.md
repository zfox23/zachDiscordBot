# zachDiscordBot
A Discord bot that I use on my Discord server.

It's a useful bot...for me, and maybe for my friends :).

Maybe you'll find it useful as a starting point for your own bot. I try to comment all of my code very thoroughly.

## Commands
zachBot (🤖 sup) currently supports the following commands:

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
- `!leave`
    - Forces the bot to leave the voice channel that it's currently in. Useful if someone plays a really long sound with `!sbv` and you hate it and want them to stop and you secretly have a deep dislike for the person who used the command but you don't really want to resolve that so you just sorta keep it to yourself.
- `!quote` OR `!quote delete <quoteID>`
    - This one is the most complicated.
    - To start adding a quote to the database, react to a message in your channel with the 🔠 emoji. You'll then see further instructions.
    - You can use `!quote <(optional) quoteID>` to display a random or specified quote from the bot's quote database. A user will only get quotes from the server and channel in which the user invoked this command.
    - You can use `!quote delete <quoteID>` to delete a quote from the bot's quote database. A user can only delete a quote from the DB if they're in the server and channel associated with that quote ID.
