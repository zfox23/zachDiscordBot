//
// stableDiscordBot.js
//
// Created by Zach Fox on 2020-03-16
//
// Distributed under the MIT License.
// See the accompanying LICENSE.txt file for details.
//

const Discord = require('discord.js');
const bot = new Discord.Client();
const auth = require('./auth.json');
const ytdl = require('ytdl-core');

bot.on('ready', () => {
    console.log(`Bot online. I'm Clamster! The clam with the pain.\nActually though I'm \`${bot.user.tag}\`.`);
});

function showCommandUsage(msg, command) {
    if (!commandDictionary[command] || !commandDictionary[command].argCombos) {
        let errorMsg = `Couldn't show command usage for command \`${commandInvocationCharacter + command}\`!`;
        msg.channel.send(errorMsg);
        console.error(errorMsg);
        return;
    }

    let argCombos = commandDictionary[command].argCombos;

    let msgToSend = "```\n";
    msgToSend += `${commandInvocationCharacter + command}: ${commandDictionary[command].description}\n\n`;
    for (let i = 0; i < argCombos.length; i++) {
        msgToSend += `${commandInvocationCharacter + command} <${argCombos[i].argCombo}>:\n`;
        msgToSend += `${argCombos[i].description}`;
        msgToSend += `\n\n`;
    }
    msgToSend += "\n```";

    msg.channel.send(msgToSend);
}



function onSoundsPlaylistAddedTo(msg) {
    let guild = msg.guild;
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);

    if (playlistInfo[guild].currentPlaylistIndex === -1) {
        playlistInfo[guild].currentPlaylistIndex = 0;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else if (playlistInfo[guild].currentPlaylistIndex > -1 && !botCurrentVoiceChannelInGuild) {
        handleStatusMessage(msg, onSoundsPlaylistAddedTo.name, "I'm not connected to a voice channel, so I'm just going to start playing the Sound you just added to the list.");
        playlistInfo[guild].currentPlaylistIndex = playlistInfo[guild].playlist.length - 1;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    }
}

function onSoundsPlaylistSpliced(spliceArgs) {
    let indexSpliced = spliceArgs[0];

}

var playlistInfo = {};
function handleYouTubeCommand(msg, args) {
    let guild = msg.guild;

    if (args[0] && args[0].indexOf("youtube.com") > -1) {
        msg.channel.send(`Adding \`${args[0]}\` to the Sounds Playlist.`);
        console.log(`Adding \`${args[0]}\` to the Sounds Playlist for Guild ID \`${guild}\`.`);
        if (!playlistInfo[guild]) {
            playlistInfo[guild] = {
                "playlist": [],
                "currentPlaylistIndex": -1
            };
        }
        playlistInfo[guild].playlist.push(args[0]);
        onSoundsPlaylistAddedTo(msg);
    } else if (args[0]) {

    } else {
        showCommandUsage(msg, "y");
    }
}

function getBotCurrentVoiceChannelInGuild(msg) {
    let guild = bot.guilds.resolve(msg.guild);
    if (!guild.available) {
        handleErrorMessage(msg, getBotCurrentVoiceChannelInGuild.name, "Guild unavailable.");
        return false;
    }

    return guild.voice && guild.voice.channel;
}

var streamDispatchers = {};
function playSoundFromURL(msg, URL) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    let voiceConnection = voiceConnections[msgSenderVoiceChannel.id];
    if (!voiceConnection) {
        handleErrorMessage(msg, playSoundFromURL.name, "The bot somehow doesn't have a voice connection in this server.");
    } else if (URL.indexOf("youtube.com" > -1)) {
        handleStatusMessage(msg, playSoundFromURL.name, `Asking \`ytdl\` nicely to play audio from ${URL}...`);
        streamDispatchers[msgSenderVoiceChannel] = voiceConnection.play(ytdl(URL, {'quality': 'highestaudio'}));
    } else {
        errorMessage = `I don't know how to play anything but audio from YouTube URLs yet, and ${URL} isn't a YouTube URL.`;
        handleErrorMessage(msg, playSoundFromURL.name, errorMessage);
    }
}

var voiceConnections = {};
function joinVoiceThenPlaySoundFromURL(msg, URL) {
    let successMessage, errorMessage;
    let guild = msg.guild;
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);
    let msgSenderVoiceChannel = msg.member.voice.channel;

    if (!msgSenderVoiceChannel) {
        errorMessage = "Join a voice channel first.";
        handleErrorMessage(msg, joinVoiceThenPlaySoundFromURL.name, errorMessage);
    } else if (!botCurrentVoiceChannelInGuild || (botCurrentVoiceChannelInGuild !== msgSenderVoiceChannel)) {
        msgSenderVoiceChannel.join()
            .then((connection) => {
                handleSuccessMessage(msg, joinVoiceThenPlaySoundFromURL.name, "I joined your voice channel successfully! Attempting to play Sound...");
                voiceConnections[msgSenderVoiceChannel.id] = connection;
                playSoundFromURL(msg, URL);
            })
            .catch((error) => {
                errorMessage = "The bot ran into an error when joining your voice channel.";
                handleErrorMessage(msg, joinVoiceThenPlaySoundFromURL.name, errorMessage);
            });
    } else if (botCurrentVoiceChannelInGuild && (botCurrentVoiceChannelInGuild === msgSenderVoiceChannel) && !voiceConnections[msgSenderVoiceChannel.id]) {
        handleErrorMessage(msg, joinVoiceThenPlaySoundFromURL.name, "Woah there! I was already in a voice channel, but I didn't realize it. I'll try to leave. If that doesn't work, kick me out manually. Then, try the `play` command.");
        botCurrentVoiceChannelInGuild.leave();
    } else if (botCurrentVoiceChannelInGuild && (botCurrentVoiceChannelInGuild === msgSenderVoiceChannel) && voiceConnections[msgSenderVoiceChannel.id]) {
        playSoundFromURL(msg, URL);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, joinVoiceThenPlaySoundFromURL.name, errorMessage);
    }
}

function handleErrorMessage(msg, functionName, errorMessage) {
    console.error(`Error in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${errorMessage}\n`);
    msg.channel.send(errorMessage);
}

function handleSuccessMessage(msg, functionName, successMessage) {
    console.log(`Success in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${successMessage}\n`);
    msg.channel.send(successMessage);
}

function handleStatusMessage(msg, functionName, statusMessage) {
    console.log(`Status in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${statusMessage}\n`);
    msg.channel.send(statusMessage);
}

function changeSoundBasedOnCurrentPlaylistIndex(msg) {
    let successMessage, errorMessage;
    let guild = msg.guild;
    let soundToPlay = playlistInfo[guild].playlist[playlistInfo[guild].currentPlaylistIndex];

    if (!playlistInfo[guild] || !playlistInfo[guild].playlist) {
        errorMessage = "Uh oh! I couldn't find a playlist for your server.";
        handleErrorMessage(msg, changeSoundBasedOnCurrentPlaylistIndex.name, errorMessage);
    } else if (playlistInfo[guild].playlist && soundToPlay) {
        successMessage = `Attempting to play Sound: \`${soundToPlay}\``;
        handleSuccessMessage(msg, changeSoundBasedOnCurrentPlaylistIndex.name, successMessage);
        joinVoiceThenPlaySoundFromURL(msg, soundToPlay);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, changeSoundBasedOnCurrentPlaylistIndex.name, errorMessage);
    }
}

function handlePlaylistNext(msg) {
    let guild = msg.guild;
    let successMessage, errorMessage;
    if (!playlistInfo[guild] || !playlistInfo[guild].playlist) {
        let errorMessages = [
            "You can't 'next' if there's no playlist!",
            "You can't fool me :)"
        ];
        errorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
        handleErrorMessage(msg, handlePlaylistNext.name, errorMessage);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex < (playlistInfo[guild].playlist.length - 1)) {
        successMessage = "Skipping to the next Sound...";
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex++;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex >= (playlistInfo[guild].playlist.length - 1)) {
        successMessage = "There are no more Sounds in the Sound Playlist. Stopping playback...";
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex = -1;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, handlePlaylistNext.name, errorMessage);
    }
}

function handlePlaylistCommand(msg, args) {
    if (args[0] && args[0] === "next") {
        handlePlaylistNext(msg);
    } else if (args[0] && args[0] === "back" || args[0] && args[0] === "prev") {

    } else if (args[0] && args[0] === "clear") {
        
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "none") {
        
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "one") {
        
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "all") {
        
    } else if (args[0] && args[0] === "del" && args[1] && !isNaN(parseInt(args[1])) && parseInt(args[1]) < playlistInfo[msg.guild].playlist.length) {
        
    } else if (args[0] && args[0] === "list") {
        
    } else if (args[0] && args[0] === "list" && args[1] && args[1] === "save") {
        
    } else if (args[0] && args[0] === "list" && args[1] && args[1] === "load") {
        
    } else {
        showCommandUsage(msg, "p");
    }
}

function handlePlayCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    if (streamDispatchers[msgSenderVoiceChannel] && streamDispatchers[msgSenderVoiceChannel].paused) {
        streamDispatchers[msgSenderVoiceChannel].resume();
    } else {
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    }
}

function handlePauseCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    if (!streamDispatchers[msgSenderVoiceChannel]) {
        handleErrorMessage(msg, handlePauseCommand.name, "Nothing to pause, captain.");
    } else if (streamDispatchers[msgSenderVoiceChannel]) {
        streamDispatchers[msgSenderVoiceChannel].pause();
    }
}

function handleLeaveCommand(msg, args) {
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);
    if (botCurrentVoiceChannelInGuild) {
        botCurrentVoiceChannelInGuild.leave();
        handleSuccessMessage(msg, handleLeaveCommand.name, "I'm outta there! If I can't leave automatically, try disconnecting me manually.");
    } else {
        handleErrorMessage(msg, handleLeaveCommand.name, "I'm either not in a voice channel or I can't detect that I'm in one.");
    }
}

const commandInvocationCharacter = "!";
const commandDictionary = {
    'y': {
        'description': 'Plays YouTube Audio.',
        'argCombos': [
            {
                'argCombo': 'Link to YouTube video',
                'description': 'Add a YouTube video directly to the Sounds Playlist by URL.'
            },
            {
                'argCombo': 'YouTube search query',
                'description': 'Add a YouTube video to the Sounds Playlist by supplying a search query to the command. The first search result of the YouTube search will be added to the Sounds Playlist.'
            }
        ],
        'handler': handleYouTubeCommand
    },
    'p': {
        'description': 'Gets or modifies the Sounds Playlist.',
        'argCombos': [
            {
                'argCombo': 'next',
                'description': 'Skip to the next Sound in the Sounds Playlist.'
            },
            {
                'argCombo': 'back | prev',
                'description': 'Go to the previous Sound in the Sounds Playlist.'
            },
            {
                'argCombo': 'clear',
                'description': 'Clear all of the Sounds from the Sounds Playlist and stop playback.'
            },
            {
                'argCombo': 'repeat none',
                'description': 'Change the Repeat Mode of the Sounds Playlist to "None". This is the default Repeat Mode.'
            },
            {
                'argCombo': 'repeat one',
                'description': 'Change the Repeat Mode of the Sounds Playlist to "Repeat One". This will cause the currently-playing Sound to repeat from the beginning once it ends.'
            },
            {
                'argCombo': 'repeat all',
                'description': 'Change the Repeat Mode of the Sounds Playlist to "Repeat All". In this mode, once the final Sound in the Sounds Playlist finishes, the playlist will start playing from the beginning.'
            },
            {
                'argCombo': 'del <index to delete>',
                'description': 'Deletes a Sound from the Sounds Playlist corresponding to the supplied "index to delete". If that index corresponds to the Sound that is currently playing, the next Sound will start playing automatically.'
            },
            {
                'argCombo': 'list',
                'description': 'List all of the Sounds currently in the Sounds Playlist.'
            },
            {
                'argCombo': 'list save <name of playlist>',
                'description': 'Saves the current Sounds Playlist to a database for easy retrieval later.'
            },
            {
                'argCombo': 'list load <name of playlist>',
                'description': 'Loads the current Sounds Playlist from a database.'
            }
        ],
        'handler': handlePlaylistCommand
    },
    'pause': {
        'name': "Pauses the currently-playing Sound.",
        'handler': handlePauseCommand
    },
    'play': {
        'name': "Plays the Sound in the Sounds Playlist corresponding to the Current Playlist Index.",
        'handler': handlePlayCommand
    },
    'next': {
        'description': "Increments the Current Playlist Index, then plays the Sound in the Sounds Playlist corresponding to the Current Playlist Index.",
        'handler': handlePlaylistNext
    },
    'leave': {
        'description': "Forces the bot to leave its current Voice Channel, if it's in one.",
        'handler': handleLeaveCommand
    }
};

bot.on('message', msg => {
    if (msg.content === 'ping') {
        msg.reply('pong');
    }

    if (msg.content.substring(0, 1) === commandInvocationCharacter) {
        console.log(`Got command in Guild \`${msg.guild}\`: ${msg.content}`);
        let args = msg.content.substring(1).split(' ');
        let command = args.splice(0, 1)[0];

        if (commandDictionary[command] && commandDictionary[command].handler) {
            commandDictionary[command].handler(msg, args);
        } else if (!commandDictionary[command]) {
            let errorMsg = `There is no entry in the Command Dictionary associated with the command \`${commandInvocationCharacter + command}\`!`;
            handleErrorMessage(msg, "bot.on('message')", errorMsg);
        } else if (commandDictionary[command] && !commandDictionary[command].handler) {
            let errorMsg = `There is no handler in the Command Dictionary for the command \`${commandInvocationCharacter + command}\`!`;
            handleErrorMessage(msg, "bot.on('message')", errorMsg);
        }
    }
});

bot.login(auth.discordToken);