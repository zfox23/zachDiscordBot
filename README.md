# Stable Discord Bot
A Discord bot that I use on my Discord server. I hope you find it useful too!

The bot is based on [the awesome `discord.js` library](https://discord.js.org).

## Features
Stable Discord Bot supports several powerful and useful features, some of which are associated with invokable commands.

After you've invited Stable Discord Bot into your server, type `!help` to see all available commands.

Top features include:
1. A powerful quote saving and retrieval system that beautifully formats quotes and includes timestamps.
    - Start the quote system by reacting to any message with the "🔠" emoji.
2. A YouTube playlist feature that allows you and your friends to listen to music while chatting in a voice channel, complete with repeat modes, flawless skipping, and high audio quality.
    - Type `!help y` and `!help p` for information about the YouTube command and the Sounds Playlist command respectively.
3. A "big emoji" feature that responds to your command with a big version of images you've saved to the bot's `bigEmoji` directory.
    - Check out `./bigEmoji/README.md` for instructions.
4. A Soundboard feature that will play sound clips that you specify while you're in a voice channel.
    - Check out `./sounds/README.md` for instructions.
5. A Role Color feature that sets your Discord role's color automatically based on the colors present in your profile picture.
    - Type `!help roleColor` to learn more.

And more!

## Prerequisites
1. [NodeJS v12.16.1](https://nodejs.org/en/)
2. A Discord account
3. A Discord bot token
    - Use a [guide like this](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) if you don't know what this means.
4. A YouTube API token
    - You can get one of those via the [Google Developer Console](https://console.developers.google.com/apis/api/youtube.googleapis.com/credentials).

## Installation
1. Clone this repo.
2. Rename `authTemplate.json` to `auth.json`.
3. Inside `auth.json`, replace `YOUR_DISCORD_BOT_TOKEN_HERE` with your Discord bot token.
4. Inside `auth.json`, replease `YOUR_YOUTUBE_API_TOKEN_HERE` with your YouTube API token.
5. Run `npm install` from a command prompt in your repo directory.
6. Run `node ./stableDiscordBot.js` from a command prompt in your repo directory.
7. Enjoy! 🎉

## Code
Have a look through `stableDiscordBot.js` if you're curious about how this bot works. Feel free to open PRs or issues against this repository if you come across bugs.

