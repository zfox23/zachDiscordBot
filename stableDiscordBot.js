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
const youtubeAuthToken = auth.youtubeToken;
const ytdl = require('ytdl-core');
const {google} = require('googleapis');
const {googleAuth} = require('google-auth-library');

bot.on('ready', () => {
    console.log(`Bot online. I'm Clamster! The clam with the pain.\nActually though I'm \`${bot.user.tag}\`.`);
});

function showCommandUsage(msg, command, optionalArg) {
    if (!commandDictionary[command]) {
        let errorMsg = `Couldn't show command usage for command \`${commandInvocationCharacter + command}\`!`;
        msg.channel.send(errorMsg);
        console.error(errorMsg);
        return;
    }

    let argCombos = commandDictionary[command].argCombos;

    let msgToSend = "```\n";
    msgToSend += `${commandInvocationCharacter + command}: ${commandDictionary[command].description}`;

    if (argCombos) {
        msgToSend += `\n\n`;

        for (let i = 0; i < argCombos.length; i++) {
            if (!optionalArg || (optionalArg && argCombos[i].argCombo.indexOf(optionalArg) > -1)) {
                msgToSend += `${commandInvocationCharacter + command} <${argCombos[i].argCombo}>:\n`;
                msgToSend += `${argCombos[i].description}`;
                msgToSend += `\n\n`;
            }
        }
    }

    msgToSend += "\n```";

    msg.channel.send(msgToSend);
}



function onSoundsPlaylistAddedTo(msg) {
    let guild = msg.guild;
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);

    if (playlistInfo[guild].currentPlaylistIndex === -1) {
        playlistInfo[guild].currentPlaylistIndex = playlistInfo[guild].playlist.length - 1;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else if (playlistInfo[guild].currentPlaylistIndex > -1 && !botCurrentVoiceChannelInGuild) {
        handleStatusMessage(msg, onSoundsPlaylistAddedTo.name, "I'm not connected to a voice channel, so I'm just going to start playing the Sound you just added to the list.");
        playlistInfo[guild].currentPlaylistIndex = playlistInfo[guild].playlist.length - 1;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    }
}

function handleYouTubeSearchThenAdd(msg, args) {
    if (!youtubeAuthToken) {
        handleErrorMessage(msg, handleYouTubeSearchThenAdd.name, "You haven't set up a YouTube API key, so this command won't work!");
        return;
    }

    let searchQuery = args.join(' ');
    let youtubeService = google.youtube('v3');
    let parameters = {
        'maxResults': '1',
        'part': 'snippet',
        'q': searchQuery,
        'type': 'video',
        'regionCode': 'US',
        'auth': youtubeAuthToken
    };

    youtubeService.search.list(parameters, (err, response) => {
        if (err) {
            handleErrorMessage(msg, "YouTube API Search", `The YouTube API returned an error: ${err}`);
            return;
        }

        if (response.data.items.length === 0) {
            handleStatusMessage(msg, "YouTube API Search", `Your search query "${searchQuery}" returned 0 results on YouTube.`)
            return;
        }

        let videoId = response.data.items[0].id.videoId;
        let fullUrl = "https://www.youtube.com/watch?v=" + videoId;
        let videoTitle = response.data.items[0].snippet.title;

        playlistInfo[msg.guild].playlist.push({
            "title": videoTitle,
            "URL": fullUrl
        });

        handleStatusMessage(msg, handleYouTubeCommand.name, `Adding\n"${videoTitle}"\nfrom\n\`${fullUrl}\`\nto the Sounds Playlist.`);

        onSoundsPlaylistAddedTo(msg);
    });
}

function getYouTubeVideoTitleFromURL(msg, youTubeURL, callback) {
    if (!youtubeAuthToken) {
        handleErrorMessage(msg, getYouTubeVideoTitleFromURL.name, "You haven't set up a YouTube API key, so I can't get a title from a YouTube video URL!");
        return;
    }
    
    let videoId = youTubeURL.substr(-11);
    
    let youtubeService = google.youtube('v3');
    let parameters = {
        'maxResults': '1',
        'part': 'snippet',
        'q': videoId,
        'type': 'video',
        'regionCode': 'US',
        'auth': youtubeAuthToken
    };

    youtubeService.search.list(parameters, (err, response) => {
        if (err) {
            handleErrorMessage(msg, "YouTube API Search", `The YouTube API returned an error: ${err}`);
            return;
        }
        
        let videoTitle = response.data.items[0].snippet.title;
        callback(msg, videoTitle);
    });
}

function maybeSetupGuildPlaylist(msg) {
    let guild = msg.guild;

    if (!playlistInfo[guild]) {
        playlistInfo[guild] = {
            "playlist": [],
            "currentPlaylistIndex": -1,
            "repeatMode": "none"
        };
    }
}

var playlistInfo = {};
function handleYouTubeCommand(msg, args) {
    let guild = msg.guild;

    maybeSetupGuildPlaylist(msg);

    if (args[0] && args[0].indexOf("youtube.com") > -1) {
        let youTubeURL = args[0];

        handleStatusMessage(msg, handleYouTubeCommand.name, `Adding \`${youTubeURL}\` to the Sounds Playlist.`);

        let newPlaylistLength = playlistInfo[guild].playlist.push({
            "URL": youTubeURL
        });
        onSoundsPlaylistAddedTo(msg);

        getYouTubeVideoTitleFromURL(msg, youTubeURL, (cbMsg, videoTitle) => {
            handleStatusMessage(cbMsg, "getYouTubeVideoTitleFromURL Callback", `Updating title associated with \`${youTubeURL}\` to "${videoTitle}".`);
            playlistInfo[guild].playlist[newPlaylistLength - 1].title = videoTitle;
        });
    } else if (args[0]) {
        handleYouTubeSearchThenAdd(msg, args);
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

function handleStreamFinished(msg) {
    if (!playlistInfo[msg.guild] || playlistInfo[msg.guild].repeatMode !== "one") {
        handlePlaylistNext(msg);
    } else if (playlistInfo[msg.guild] && playlistInfo[msg.guild].currentPlaylistIndex && playlistInfo[msg.guild].repeatMode === "one") {
        playlistInfo[msg.guild].currentPlaylistIndex--;
        handlePlaylistNext(msg);
    } else {
        handleErrorMessage(msg, handleStreamFinished.name, "The stream finished, and there was an unhandled error case.");
    }
}

var streamDispatchers = {};
function playSoundFromURL(msg, URL) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    let voiceConnection = voiceConnections[msgSenderVoiceChannel.id];
    if (!voiceConnection) {
        handleErrorMessage(msg, playSoundFromURL.name, "The bot somehow doesn't have a voice connection in this server.");
    } else if (URL.indexOf("youtube.com" > -1)) {
        handleStatusMessage(msg, playSoundFromURL.name, `Asking \`ytdl\` nicely to play audio from \`${URL}\`...`);
        streamDispatchers[msgSenderVoiceChannel] = voiceConnection.play(ytdl(URL, {
            'quality': 'highestaudio',
            'volume': playlistInfo[msg.guild].volume || 1.0,
            'highWaterMark': 1 << 25 // Fixes an issue where `StreamDispatcher` emits "finish" event too early.
        }));
        streamDispatchers[msgSenderVoiceChannel].on('close', () => {
            handleStatusMessage(msg, "StreamDispatcher on 'close'", "The `StreamDispatcher` emitted a `close` event.");
        });
        streamDispatchers[msgSenderVoiceChannel].on('finish', (reason) => {
            handleStatusMessage(msg, "StreamDispatcher on 'finish'", `The \`StreamDispatcher\` emitted a \`finish\` event with reason "${reason || "<No Reason>"}".`);
            handleStreamFinished(msg);
        });
        streamDispatchers[msgSenderVoiceChannel].on('error', (err) => {
            handleErrorMessage(msg, "StreamDispatcher on 'error'", `The \`StreamDispatcher\` emitted an \`error\` event. Error: ${err}`);
        });
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

function handleStopCommand(msg, args) {
    let guild = msg.guild;
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);
    let msgSenderVoiceChannel = msg.member.voice.channel;
    let retval = {
        "didLeave": false
    };

    if (!botCurrentVoiceChannelInGuild && playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "I'm not in a voice channel, so I can't stop anything. I'll still reset the Current Playlist Index, though.");
        playlistInfo[guild].currentPlaylistIndex = -1;
    } else if (!botCurrentVoiceChannelInGuild && !playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "I'm not in a voice channel, so I can't stop anything. There's also no playlist associated with this Guild, so I'm going to do nothing.");
    } else if (botCurrentVoiceChannelInGuild && !playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "There's no playlist associated with this Guild, so I won't reset the Current Playlist Index. However, I will try to leave the voice channel I'm in. If I don't leave the voice channel, please remove me manually.");
        botCurrentVoiceChannelInGuild.leave();
        retval.didLeave = true;
    } else if (botCurrentVoiceChannelInGuild && playlistInfo[guild] && voiceConnections[msgSenderVoiceChannel.id]) {
        handleSuccessMessage(msg, handleStopCommand.name, "Resetting Current Playlist Index and leaving voice channel.");
        playlistInfo[guild].currentPlaylistIndex = -1;
        voiceConnections[msgSenderVoiceChannel.id].disconnect();
        voiceConnections[msgSenderVoiceChannel.id] = null;
    } else if (botCurrentVoiceChannelInGuild && playlistInfo[guild] && !voiceConnections[msgSenderVoiceChannel.id]) {
        handleSuccessMessage(msg, handleStopCommand.name, "I'm in a voice channel, but I don't have a Voice Connection. I'm going to reset the Current Playlist Index and attempt to leave. If I don't leave the voice channel, please remove me manually.");
        playlistInfo[guild].currentPlaylistIndex = -1;
        botCurrentVoiceChannelInGuild.leave();
        retval.didLeave = true;
        voiceConnections[msgSenderVoiceChannel.id] = null;
    }

    return retval;
}

function changeSoundBasedOnCurrentPlaylistIndex(msg) {
    let successMessage, errorMessage;
    let guild = msg.guild;

    if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex && playlistInfo[guild].currentPlaylistIndex === -1) {
        handlePlaylistNext(msg);
        return;
    }

    let soundToPlay = playlistInfo[guild].playlist[playlistInfo[guild].currentPlaylistIndex].URL;

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
        successMessage = "Playing the next Sound...";
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex++;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex >= (playlistInfo[guild].playlist.length - 1) && playlistInfo[guild].repeatMode !== "all") {
        successMessage = "There are no more Sounds in the Sound Playlist. Stopping playback...";
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        handleStopCommand(msg);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex >= (playlistInfo[guild].playlist.length - 1) && playlistInfo[guild].repeatMode === "all") {
        successMessage = `The Playlist's repeat mode is "all". That was the end of the playlist. Starting the playlist over...`;
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex = -1;
        handlePlaylistNext(msg);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, handlePlaylistNext.name, errorMessage);
    }
}

function handlePlaylistPrev(msg) {
    let guild = msg.guild;
    let successMessage, errorMessage;
    if (!playlistInfo[guild] || !playlistInfo[guild].playlist) {
        let errorMessages = [
            "You can't 'prev' if there's no playlist!"
        ];
        errorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
        handleErrorMessage(msg, handlePlaylistPrev.name, errorMessage);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex > 0) {
        successMessage = "Skipping to the previous Sound...";
        handleSuccessMessage(msg, handlePlaylistPrev.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex--;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex === 0) {
        successMessage = "There are no more previous Sounds in the Sound Playlist. Stopping playback...";
        handleSuccessMessage(msg, handlePlaylistPrev.name, successMessage);
        playlistInfo[guild].currentPlaylistIndex = -1;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, handlePlaylistPrev.name, errorMessage);
    }
}

function handlePlaylistClear(msg) {
    let guild = msg.guild;

    if (playlistInfo[guild]) {
        playlistInfo[guild].playlist = [];
        handleSuccessMessage(msg, handlePlaylistClear.name, "Playlist cleared.");
        handleStopCommand(msg);
    } else {
        handleErrorMessage(msg, handlePlaylistClear.name, 'Unhandled state.');
    }
}

const possibleRepeatModes = ["none", "one", "all"];
function handlePlaylistChangeRepeatMode(msg, newRepeatMode) {
    let guild = msg.guild;
    
    if (!possibleRepeatModes.contains(newRepeatMode)) {
        handleErrorMessage(msg, handlePlaylistChangeRepeatMode.name, 'Unhandled repeat mode.');
    } else if (playlistInfo[guild]) {
        playlistInfo[guild].repeatMode = newRepeatMode;
        handleSuccessMessage(msg, handlePlaylistChangeRepeatMode.name, `Playlist repeat mode is now "${newRepeatMode}".`);
    } else if (!playlistInfo[guild]) {
        maybeSetupGuildPlaylist(msg);
        handlePlaylistChangeRepeatMode(msg, newRepeatMode);
    } else {
        handleErrorMessage(msg, handlePlaylistClear.name, 'Unhandled state.');
    }
}

function onSoundsPlaylistSpliced(msg, deletedIndex) {
    let guild = msg.guild;

    if (!playlistInfo[guild].playlist) {
        handleErrorMessage(msg, handleDeleteFromPlaylist.name, "I'm not quite sure how you got here...but you don't have a playlist.");
    } else if (deletedIndex === playlistInfo[guild].currentPlaylistIndex) {
        playlistInfo[guild].currentPlaylistIndex--;
        handlePlaylistNext(msg);
    }
}

function handleDeleteFromPlaylist(msg, indexToDelete) {
    let guild = msg.guild;
    indexToDelete = parseInt(indexToDelete);

    if (isNaN(indexToDelete)) {
        showCommandUsage(msg, "y", "del");
    } else if (!playlistInfo[guild].playlist) {
        handleErrorMessage(msg, handleDeleteFromPlaylist.name, "There's no playlist from which I can delete.");
    } else if (indexToDelete >= playlistInfo[guild].playlist.length || indexToDelete < 0) {
        handleErrorMessage(msg, handleDeleteFromPlaylist.name, "Deletion index out of range.");
    } else if (indexToDelete < playlistInfo[guild].playlist.length && indexToDelete >= 0) {
        playlistInfo[guild].playlist.splice(indexToDelete, 1);
        handleSuccessMessage(msg, handleDeleteFromPlaylist.name, `Sound with index ${indexToDelete} deleted from Playlist.`);
        onSoundsPlaylistSpliced(msg, indexToDelete);
    } else {
        handleErrorMessage(msg, handleDeleteFromPlaylist.name, 'Unhandled state.');
    }
}

function handlePlaylistList(msg) {
    let guild = msg.guild;

    if (!playlistInfo[guild] || !playlistInfo[guild].playlist || playlistInfo[guild].playlist.length === 0) {
        handleErrorMessage(msg, handlePlaylistList.name, "There's no playlist here.");
    } else if (playlistInfo[guild].playlist && playlistInfo[guild].playlist.length > 0) {
        console.log(`Listing playlist for guild ${guild}...`);
        let playlistString = "```\n";
        for (let i = 0; i < playlistInfo[guild].playlist.length; i++ ) {
            if (playlistInfo[guild].currentPlaylistIndex === i) {
                playlistString += "🎶 ";
            }

            let currentDisplayTitle = playlistInfo[guild].playlist[i].title;
            if (!currentDisplayTitle) {
                currentDisplayTitle = playlistInfo[guild].playlist[i].URL;
            }
            playlistString += `${i}. ${currentDisplayTitle}\n`;
        }
        playlistString += "```\n";

        msg.channel.send(playlistString);
    } else {
        handleErrorMessage(msg, handlePlaylistList.name, 'Unhandled state.');
    }
}

function handlePlaylistCommand(msg, args) {
    if (args[0] && args[0] === "next") {
        handlePlaylistNext(msg);
    } else if (args[0] && args[0] === "back" || args[0] && args[0] === "prev") {
        handlePlaylistPrev(msg);
    } else if (args[0] && args[0] === "clear") {
        handlePlaylistClear(msg);
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "none") {
        handlePlaylistChangeRepeatMode(msg, args[1]);
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "one") {
        handlePlaylistChangeRepeatMode(msg, args[1]);
    } else if (args[0] && args[0] === "repeat" && args[1] && args[1] === "all") {
        handlePlaylistChangeRepeatMode(msg, args[1]);
    } else if (args[0] && args[0] === "del" && args[1]) {
        handleDeleteFromPlaylist(msg, args[1]);
    } else if (args[0] && args[0] === "list") {
        handlePlaylistList(msg);
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
        handleStatusMessage(msg, handlePauseCommand.name, "Nothing to pause, captain.");
    } else if (streamDispatchers[msgSenderVoiceChannel]) {
        streamDispatchers[msgSenderVoiceChannel].pause();
    }
}

function handleLeaveCommand(msg, args) {
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);
    if (botCurrentVoiceChannelInGuild) {
        handleStopCommand(msg);
    } else {
        handleErrorMessage(msg, handleLeaveCommand.name, "I'm either not in a voice channel or I can't detect that I'm in one.");
    }
}

function handleVolumeCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;

    if (args[0] && playlistInfo[msg.guild]) {
        playlistInfo[msg.guild].volume = args[0];
    } else if (args[0] && !playlistInfo[msg.guild]) {
        playlistInfo[msg.guild] = {
            "volume": args[0]
        };
    }

    if (args[0] && streamDispatchers[msgSenderVoiceChannel]) {
        streamDispatchers[msgSenderVoiceChannel].setVolume(playlistInfo[msg.guild].volume);
    } else if (args[0] && !streamDispatchers[msgSenderVoiceChannel]) {
        // No-op; logic handled by sets of conditionals above.
        // We want to set the volume for the current guild's playlist, and that volume
        // will get picked up the next time we start playing a Sound.
    } else {
        showCommandUsage(msg, "vol");
    }
}

function handleHelpCommand(msg, args) {
    if (args[0] && args[1]) {
        showCommandUsage(msg, args[0], args[1]);
    } else if (args[0] && !args[1]) {
        showCommandUsage(msg, args[0]);
    } else if (!args[0]) {
        let commandDictionaryKeys = Object.keys(commandDictionary);
        let allHelpMessage = `Here are the commands I support right now:\n`;
        allHelpMessage += '```';
        for (let i = 0; i < commandDictionaryKeys.length; i++) {
            allHelpMessage += `${commandDictionaryKeys[i]}\n`
        }
        allHelpMessage += '```\n';
        allHelpMessage += `You can get usage help with each individual command by typing \`${commandInvocationCharacter}help <command>\`.`;

        msg.channel.send(allHelpMessage);
    } else {
        showCommandUsage(msg, "help");
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
        'description': "Pauses the currently-playing Sound.",
        'handler': handlePauseCommand
    },
    'play': {
        'description': "Plays the Sound in the Sounds Playlist corresponding to the Current Playlist Index.",
        'handler': handlePlayCommand
    },
    'next': {
        'description': "Increments the Current Playlist Index, then plays the Sound in the Sounds Playlist corresponding to the Current Playlist Index.",
        'handler': handlePlaylistNext
    },
    'prev': {
        'description': "Decrements the Current Playlist Index, then plays the Sound in the Sounds Playlist corresponding to the Current Playlist Index.",
        'handler': handlePlaylistPrev
    },
    'stop': {
        'description': "Sets the Current Playlist Index to `-1`, then stops Sound playback.",
        'handler': handleStopCommand
    },
    'leave': {
        'description': "Forces the bot to leave its current Voice Channel, if it's in one.",
        'handler': handleLeaveCommand
    },
    'v': {
        'description': "Sets the volume of the current or future Sound that plays from the Sound Playlist.",
        'argCombos': [
            {
                'argCombo': '<volume>',
                'description': 'The desired volume, from 0.1 to 2.0.'
            }
        ],
        'handler': handleVolumeCommand
    },
    'help': {
        'description': "Displays usage for all commands.",
        'argCombos': [
            {
                'argCombo': '<Optional. Command Argument>',
                'description': 'Optional. Command argument to get help with.'
            }
        ],
        'handler': handleHelpCommand
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