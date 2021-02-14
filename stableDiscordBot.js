//
// stableDiscordBot.js
//
// Created by Zach Fox on 2020-03-16
//
// Distributed under the MIT License.
// See the accompanying LICENSE.txt file for details.
//

const Discord = require('discord.js');
const discordBackup = require('discord-backup');
const bot = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
const auth = require('./auth.json');
const youtubeAuthToken = auth.youtubeToken;
const ytdl = require('ytdl-core');
const { google } = require('googleapis');
const { googleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const https = require('https');
const imageMagick = require('imagemagick');
const ColorScheme = require('color-scheme');
const rgbHex = require('rgb-hex');
const moment = require('moment');
const SQLite = require("better-sqlite3");

const quotesSQL = new SQLite('./quotes/quotes.sqlite');
const wikiSQL = new SQLite('./wiki/wiki.sqlite');

function deleteTempFiles() {
    let directory = __dirname + '/temp';
    let files = fs.readdirSync(directory);

    for (const file of files) {
        if (file === "README.md" || file.indexOf(".mp3") > -1) {
            continue;
        }

        fs.unlinkSync(path.join(directory, file));
    }
}

function prepareSQLite() {
    // Check if the table "quotes" exists.
    const quotesTable = quotesSQL.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'quotes';").get();
    if (!quotesTable['count(*)']) {
        // If the table isn't there, create it and setup the database correctly.
        quotesSQL.prepare("CREATE TABLE quotes (id INTEGER PRIMARY KEY, created DATETIME DEFAULT CURRENT_TIMESTAMP, userWhoAdded TEXT, guild TEXT, channel TEXT, quote TEXT);").run();
        // Ensure that the "id" row is always unique and indexed.
        quotesSQL.prepare("CREATE UNIQUE INDEX idx_quotes_id ON quotes (id);").run();
        quotesSQL.pragma("synchronous = 1");
        quotesSQL.pragma("journal_mode = wal");
    }
    // We have some prepared statements to get, set, and delete the quote data.
    bot.getQuote = quotesSQL.prepare("SELECT * FROM quotes WHERE guild = ? AND channel = ? AND id = ?;");
    bot.getRandomQuote = quotesSQL.prepare("SELECT * FROM quotes WHERE guild = ? AND channel = ? ORDER BY random() LIMIT 1;");
    bot.setQuote = quotesSQL.prepare("INSERT OR REPLACE INTO quotes (userWhoAdded, guild, channel, quote) VALUES (@userWhoAdded, @guild, @channel, @quote);");
    bot.deleteQuote = quotesSQL.prepare("DELETE FROM quotes WHERE guild = ? AND channel = ? AND id = ?;");

    // Check if the table "wiki" exists.
    const wikiTable = wikiSQL.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'wiki';").get();
    if (!wikiTable['count(*)']) {
        // If the table isn't there, create it and setup the database correctly.
        wikiSQL.prepare("CREATE TABLE wiki (id INTEGER PRIMARY KEY, created DATETIME DEFAULT CURRENT_TIMESTAMP, userWhoAdded TEXT, guild TEXT, topic TEXT, contents TEXT);").run();
        // Ensure that the "id" row is always unique and indexed.
        wikiSQL.prepare("CREATE UNIQUE INDEX idx_wiki_id ON wiki (id);").run();
        wikiSQL.pragma("synchronous = 1");
        wikiSQL.pragma("journal_mode = wal");
    }
    // We have some prepared statements to get, set, and delete the quote data.
    bot.getWikiTopicContents = wikiSQL.prepare("SELECT * FROM wiki WHERE guild = ? AND topic = ? ORDER BY CURRENT_TIMESTAMP LIMIT 1;");
    bot.setWikiTopicContents = wikiSQL.prepare("INSERT INTO wiki (guild, topic, contents) VALUES (@guild, @topic, @contents);");
    bot.deleteWikiTopicContents = wikiSQL.prepare("DELETE FROM wiki WHERE guild = ? AND topic = ?;");
}

bot.on('ready', () => {
    console.log("Clearing temporary file directory...");
    deleteTempFiles();
    console.log("Cleared temporary file directory.");

    console.log("Preparing SQLite tables and statements...");
    prepareSQLite();
    console.log("Prepared!");

    console.log(`Bot online. I'm Clamster! The clam with the pain.\nActually though I'm \`${bot.user.tag}\`.\n`);
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
                msgToSend += `${argCombos[i].description}\n`;
                if (argCombos[i].handler) {
                    msgToSend += argCombos[i].handler(msg);
                    msgToSend += `\n`;
                }
                msgToSend += `\n`;
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
        handleStatusMessage(msg, onSoundsPlaylistAddedTo.name, "I'm not connected to a voice channel, so I'm just going to start playing the Sound you just added to the list.", true);
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
            "URL": fullUrl,
            "addedBy": msg.author.username
        });

        handleStatusMessage(msg, handleYouTubeCommand.name, `Adding "${videoTitle}" from ${fullUrl} to the Sounds Playlist.`);

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

        if (response.data.items[0]) {
            let videoTitle = response.data.items[0].snippet.title;
            callback(msg, videoTitle);
        }
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
    let msgSenderVoiceChannel = msg.member.voice.channel;

    if (!msgSenderVoiceChannel) {
        errorMessage = "Join a voice channel first.";
        handleErrorMessage(msg, handleYouTubeCommand.name, errorMessage);
        return;
    }

    maybeSetupGuildPlaylist(msg);

    if (args[0] && args[0].indexOf("youtube.com") > -1) {
        let youTubeURL = args[0];

        handleStatusMessage(msg, handleYouTubeCommand.name, `Adding \`${youTubeURL}\` to the Sounds Playlist.`);

        let newPlaylistLength = playlistInfo[guild].playlist.push({
            "URL": youTubeURL,
            "addedBy": msg.author.username
        });
        onSoundsPlaylistAddedTo(msg);

        getYouTubeVideoTitleFromURL(msg, youTubeURL, (cbMsg, videoTitle) => {
            handleStatusMessage(cbMsg, "getYouTubeVideoTitleFromURL Callback", `Updating title associated with \`${youTubeURL}\` to "${videoTitle}".`, true);
            playlistInfo[guild].playlist[newPlaylistLength - 1].title = videoTitle;
        });
    } else if (args[0]) {
        handleYouTubeSearchThenAdd(msg, args);
    } else {
        showCommandUsage(msg, "y");
    }
}

const soundSpeakersFolder = "./sounds/";
var soundboardData = {};
function refreshSoundboardData() {
    soundboardData = {};
    let soundSpeakersSubfolders = fs.readdirSync(soundSpeakersFolder);
    for (let i = 0; i < soundSpeakersSubfolders.length; i++) {
        let currentSpeaker = soundSpeakersSubfolders[i];

        if (currentSpeaker === "README.md" || currentSpeaker.indexOf("sounds.sqlite") > -1) {
            continue;
        }

        let soundIDs = fs.readdirSync(soundSpeakersFolder + currentSpeaker);
        for (let j = 0; j < soundIDs.length; j++) {
            let soundID = soundIDs[j].slice(0, -4);

            if (!soundboardData[soundID]) {
                soundboardData[soundID] = [];
            }

            soundboardData[soundID].push(currentSpeaker);
        }
    }
}

function formatAvailableSoundIDs(msg) {
    refreshSoundboardData();
    let availableSoundIDsList = Object.keys(soundboardData).join(", ");
    if (availableSoundIDsList.length > 1500) {
        availableSoundIDsList = "There's too many Sound IDs to display! Here's some:\n" + availableSoundIDsList.substring(0, 1500) + "...";
    }
    return availableSoundIDsList;
}

function handleSbvCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;

    if (!msgSenderVoiceChannel) {
        errorMessage = "Join a voice channel first.";
        handleErrorMessage(msg, handleSbvCommand.name, errorMessage);
        return;
    }

    refreshSoundboardData();
    maybeSetupGuildPlaylist(msg);

    let soundID = args[0];
    let person = args[1];

    if (soundID && !soundboardData[soundID]) {
        handleErrorMessage(msg, handleSbvCommand.name, "Invalid Sound ID.");
    } else if (soundID && soundboardData[soundID] && person && soundboardData[soundID].contains(person)) {
        handleSuccessMessage(msg, handleSbvCommand.name, `Adding "${soundID}" by ${person} to Sounds Playlist...`);
        playlistInfo[msg.guild].playlist.push({
            "URL": `${soundSpeakersFolder}${person}/${soundID}.mp3`,
            "title": soundID
        });
        onSoundsPlaylistAddedTo(msg);
    } else if (soundID && soundboardData[soundID] && person && !soundboardData[soundID].contains(person)) {
        handleErrorMessage(msg, handleSbvCommand.name, "That person didn't say that sound!");
    } else if (soundID && soundboardData[soundID] && !person) {
        person = soundboardData[soundID][Math.floor(Math.random() * soundboardData[soundID].length)];
        handleSuccessMessage(msg, handleSbvCommand.name, `Adding "${soundID}" by ${person} to Sounds Playlist...`);
        playlistInfo[msg.guild].playlist.push({
            "URL": `${soundSpeakersFolder}${person}/${soundID}.mp3`,
            "title": soundID
        });
        onSoundsPlaylistAddedTo(msg);
    } else if (!soundID && !person) {
        showCommandUsage(msg, "handleSbvCommand");
    } else {
        handleErrorMessage(msg, handleSbvCommand.name, "Unhandled case.");
    }
}

function getBotCurrentVoiceChannelInGuild(msg) {
    let guild = bot.guilds.resolve(msg.guild);
    if (!guild.available) {
        handleErrorMessage(msg, getBotCurrentVoiceChannelInGuild.name, "Guild unavailable.", true);
        return false;
    }

    return guild.voice && guild.voice.channel;
}

function handleStreamFinished(msg, playLeaveSoundBeforeLeaving) {
    if (!playlistInfo[msg.guild] || playlistInfo[msg.guild].repeatMode !== "one") {
        handlePlaylistNext(msg, playLeaveSoundBeforeLeaving);
    } else if (playlistInfo[msg.guild] && playlistInfo[msg.guild].currentPlaylistIndex && playlistInfo[msg.guild].repeatMode === "one") {
        playlistInfo[msg.guild].currentPlaylistIndex--;
        handlePlaylistNext(msg);
    } else {
        handleErrorMessage(msg, handleStreamFinished.name, "The stream finished, and there was an unhandled error case.");
    }
}

var streamDispatchers = {};
function playSoundFromURL(msg, URL) {
    handleStatusMessage(msg, playSoundFromURL.name, `Attempting to play sound with URL \`${URL}\`...`, true);

    let msgSenderVoiceChannel = msg.member.voice.channel;
    let voiceConnection = voiceConnections[msgSenderVoiceChannel.id];
    if (!msgSenderVoiceChannel) {
        handleErrorMessage(msg, playSoundFromURL.name, "It's rude for you to try to change playback while you're not in a voice channel. >:(");
    } else if (!voiceConnection) {
        handleErrorMessage(msg, playSoundFromURL.name, "The bot somehow doesn't have a voice connection in this server.");
    } else if (URL.indexOf("youtube.com") > -1) {
        handleStatusMessage(msg, playSoundFromURL.name, `Asking \`ytdl\` nicely to play audio from \`${URL}\`...`, true);
        streamDispatchers[msgSenderVoiceChannel] = voiceConnection.play(ytdl(URL, {
            'quality': 'highestaudio',
            'volume': playlistInfo[msg.guild].volume || 1.0,
            'highWaterMark': 1 << 25 // Fixes an issue where `StreamDispatcher` emits "finish" event too early.
        }), {
            "bitrate": "auto"
        });
        streamDispatchers[msgSenderVoiceChannel].on('close', () => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('close');
            handleStatusMessage(msg, "StreamDispatcher on 'close'", "The `StreamDispatcher` emitted a `close` event.", true);
        });
        streamDispatchers[msgSenderVoiceChannel].on('finish', (reason) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('finish');
            if (reason) {
                handleStatusMessage(msg, "StreamDispatcher on 'finish'", `The \`StreamDispatcher\` emitted a \`finish\` event with reason "${reason || "<No Reason>"}".`, true);
            }
            handleStreamFinished(msg, true);
        });
        streamDispatchers[msgSenderVoiceChannel].on('error', (err) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('error');
            handleErrorMessage(msg, "StreamDispatcher on 'error'", `The \`StreamDispatcher\` emitted an \`error\` event. Error: ${err}`, true);
        });
    } else if (fs.existsSync(URL)) {
        handleStatusMessage(msg, playSoundFromURL.name, `Playing \`${URL}\` from filesystem...`, true);
        streamDispatchers[msgSenderVoiceChannel] = voiceConnection.play(URL, {
            "bitrate": "auto"
        });
        streamDispatchers[msgSenderVoiceChannel].on('close', () => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('close');
            handleStatusMessage(msg, "StreamDispatcher on 'close'", "The `StreamDispatcher` emitted a `close` event.", true);
        });
        streamDispatchers[msgSenderVoiceChannel].on('finish', (reason) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('finish');
            if (reason) {
                handleStatusMessage(msg, "StreamDispatcher on 'finish'", `The \`StreamDispatcher\` emitted a \`finish\` event with reason "${reason || "<No Reason>"}".`, true);
            }
            for (let i = playlistInfo[msg.guild].playlist.length - 1; i >= 0; i--) {
                if (playlistInfo[msg.guild].playlist[i].URL === URL) {
                    playlistInfo[msg.guild].playlist.splice(i, 1);
                    playlistInfo[msg.guild].currentPlaylistIndex--;
                    break;
                }
            }
            handleStreamFinished(msg, false);
        });
        streamDispatchers[msgSenderVoiceChannel].on('error', (err) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('error');
            handleErrorMessage(msg, "StreamDispatcher on 'error'", `The \`StreamDispatcher\` emitted an \`error\` event. Error: ${err}`, true);
        });
    } else {
        errorMessage = `I don't know how to play the URL \`${URL}\`.`;
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
                handleSuccessMessage(msg, joinVoiceThenPlaySoundFromURL.name, "I joined your voice channel successfully!", true);
                voiceConnections[msgSenderVoiceChannel.id] = connection;
                playSoundFromURL(msg, URL);
            })
            .catch((error) => {
                errorMessage = `The bot ran into an error when joining your voice channel: ${error}`;
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

function handleErrorMessage(msg, functionName, errorMessage, suppressChannelMessage) {
    console.error(`Error in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${errorMessage}\n`);
    if (!suppressChannelMessage) {
        msg.channel.send(errorMessage);
    }
}

function handleSuccessMessage(msg, functionName, successMessage, suppressChannelMessage) {
    console.log(`Success in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${successMessage}\n`);
    if (!suppressChannelMessage) {
        msg.channel.send(successMessage);
    }
}

function handleStatusMessage(msg, functionName, statusMessage, suppressChannelMessage) {
    console.log(`Status in \`${functionName}()\` for Guild \`${msg.guild}\`:\n${statusMessage}\n`);
    if (!suppressChannelMessage) {
        msg.channel.send(statusMessage);
    }
}

function pushPlaylistEndingSoundThenPlayThenLeave(msg) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    let voiceConnection = voiceConnections[msgSenderVoiceChannel.id];

    let randomEndingSoundFolder = './botResources/sounds/playlistEndingSounds/';
    let randomEndingSoundFolderContents = fs.readdirSync(randomEndingSoundFolder);
    let randomEndingSoundFilename = randomEndingSoundFolderContents[Math.floor(Math.random() * randomEndingSoundFolderContents.length)];
    if (!randomEndingSoundFilename) {
        return;
    }

    let randomEndingSoundPath = randomEndingSoundFolder + randomEndingSoundFilename;
    let readStream = fs.createReadStream(randomEndingSoundPath);

    if (!msgSenderVoiceChannel) {
        // No-op.
    } else if (!voiceConnections[msgSenderVoiceChannel.id]) {
        handleErrorMessage(msg, pushPlaylistEndingSoundThenPlayThenLeave.name, "No voice connection!");
    } else if (streamDispatchers[msgSenderVoiceChannel]) {
        streamDispatchers[msgSenderVoiceChannel] = voiceConnection.play(readStream, {
            "volume": 1.0
        });
        streamDispatchers[msgSenderVoiceChannel].on('close', () => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('close');
        });
        streamDispatchers[msgSenderVoiceChannel].on('finish', (reason) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('finish');
            handleStopCommand(msg);
        });
        streamDispatchers[msgSenderVoiceChannel].on('error', (err) => {
            handleVolumeCommand(msg, [1.0]);
            streamDispatchers[msgSenderVoiceChannel].removeAllListeners('error');
            handleErrorMessage(msg, "StreamDispatcher on 'error'", `The \`StreamDispatcher\` emitted an \`error\` event. Error: ${err}`);
        });
    } else {
        handleErrorMessage(msg, pushPlaylistEndingSoundThenPlayThenLeave.name, 'Unhandled state.');
    }
}

function handleStopCommand(msg, args, playLeaveSoundBeforeLeaving) {
    let guild = msg.guild;
    let botCurrentVoiceChannelInGuild = getBotCurrentVoiceChannelInGuild(msg);
    let msgSenderVoiceChannel = msg.member.voice.channel;
    let retval = {
        "didLeave": false
    };

    if (!msgSenderVoiceChannel) {
        handleErrorMessage(msg, handleStopCommand.name, "It's rude for you to try to change playback while you're not in a voice channel. >:(");
    } else if (!botCurrentVoiceChannelInGuild && playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "I'm not in a voice channel, so I can't stop anything. I'll still reset the Current Playlist Index, though.");
        playlistInfo[guild].currentPlaylistIndex = -1;
    } else if (!botCurrentVoiceChannelInGuild && !playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "I'm not in a voice channel, so I can't stop anything. There's also no playlist associated with this Guild, so I'm going to do nothing.");
    } else if (botCurrentVoiceChannelInGuild && !playlistInfo[guild]) {
        handleStatusMessage(msg, handleStopCommand.name, "There's no playlist associated with this Guild, so I won't reset the Current Playlist Index. However, I will try to leave the voice channel I'm in. If I don't leave the voice channel, please remove me manually.");
        botCurrentVoiceChannelInGuild.leave();
        retval.didLeave = true;
    } else if (botCurrentVoiceChannelInGuild && playlistInfo[guild] && voiceConnections[msgSenderVoiceChannel.id] && !playLeaveSoundBeforeLeaving) {
        handleSuccessMessage(msg, handleStopCommand.name, "Resetting Current Playlist Index and leaving voice channel.", true);
        playlistInfo[guild].currentPlaylistIndex = -1;
        voiceConnections[msgSenderVoiceChannel.id].disconnect();
        voiceConnections[msgSenderVoiceChannel.id] = null;
    } else if (botCurrentVoiceChannelInGuild && playlistInfo[guild] && voiceConnections[msgSenderVoiceChannel.id] && playLeaveSoundBeforeLeaving) {
        handleSuccessMessage(msg, handleStopCommand.name, "Resetting Current Playlist Index and leaving voice channel after a short sound clip...", true);
        pushPlaylistEndingSoundThenPlayThenLeave(msg);
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
        handleSuccessMessage(msg, changeSoundBasedOnCurrentPlaylistIndex.name, successMessage, true);
        joinVoiceThenPlaySoundFromURL(msg, soundToPlay);
    } else {
        errorMessage = "Unhandled state.";
        handleErrorMessage(msg, changeSoundBasedOnCurrentPlaylistIndex.name, errorMessage);
    }
}

function handlePlaylistNext(msg, playLeaveSoundBeforeLeaving) {
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
    } else if (playlistInfo[guild] && playlistInfo[guild].currentPlaylistIndex >= (playlistInfo[guild].playlist.length - 1) && (playlistInfo[guild].repeatMode !== "all" || playlistInfo[guild].playlist.length === 0)) {
        successMessage = "There are no more Sounds in the Sound Playlist. Stopping playback...";
        handleSuccessMessage(msg, handlePlaylistNext.name, successMessage);
        handleStopCommand(msg, null, playLeaveSoundBeforeLeaving);
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

    if (!possibleRepeatModes.indexOf(newRepeatMode) === -1) {
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
        let playlistString;
        for (let i = 0; i < playlistInfo[guild].playlist.length; i++) {
            if (playlistInfo[guild].currentPlaylistIndex === i) {
                playlistString += "🎶 ";
            }

            let currentDisplayTitle = playlistInfo[guild].playlist[i].title;
            if (!currentDisplayTitle) {
                currentDisplayTitle = playlistInfo[guild].playlist[i].URL;
            }

            playlistString += `${i}. ${currentDisplayTitle}`;

            let addedBy = playlistInfo[guild].playlist[i].addedBy;
            if (addedBy) {
                playlistString += ` - Added by ${addedBy}`;
            }

            playlistString += `\n`;
        }

        let splitMsg = stringChop2000(playlistString);
        splitMsg.forEach((strToSend) => {
            msg.channel.send(`\`\`\`${strToSend}\`\`\``);
        });
    } else {
        handleErrorMessage(msg, handlePlaylistList.name, 'Unhandled state.');
    }
}

function handlePlaylistGoto(msg, args) {
    let guild = msg.guild;
    let indexToGoTo = parseInt(args[1]);

    if (isNaN(indexToGoTo)) {
        handleErrorMessage(msg, handlePlaylistGoto.name, "Invalid index specified.");
    } else if (!playlistInfo[guild] || !playlistInfo[guild].playlist || playlistInfo[guild].playlist.length === 0) {
        handleErrorMessage(msg, handlePlaylistGoto.name, "There's no playlist here.");
    } else if (indexToGoTo < 0 || indexToGoTo > playlistInfo[guild].playlist.length - 1) {
        handleErrorMessage(msg, handlePlaylistGoto.name, "Specified index out of range.");
    } else if (playlistInfo[guild].playlist && playlistInfo[guild].playlist.length > 0 && !isNaN(indexToGoTo) && indexToGoTo >= 0 && indexToGoTo <= playlistInfo[guild].playlist.length - 1) {
        playlistInfo[guild].currentPlaylistIndex = indexToGoTo;
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    } else {
        handleErrorMessage(msg, handlePlaylistGoto.name, 'Unhandled state.');
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
    } else if (args[0] && args[0] === "goto" && args[1]) {
        handlePlaylistGoto(msg, args);
    } else if (args[0] && args[0] === "list" && args[1] && args[1] === "save") {
        handleErrorMessage(msg, handlePlaylistCommand, `Wow, you actually wanted to save a playlist? My developer hasn't implemented this yet because nobody uses it. Message him and maybe he'll get this working again.`);
    } else if (args[0] && args[0] === "list" && args[1] && args[1] === "load") {
        handleErrorMessage(msg, handlePlaylistCommand, `Wow, you actually wanted to load a playlist? My developer hasn't implemented this yet because nobody uses it. Message him and maybe he'll get this working again.`);
    } else {
        showCommandUsage(msg, "p");
    }
}

function handlePlayCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    if (!msgSenderVoiceChannel) {
        handleErrorMessage(msg, handlePlayCommand.name, "It's rude for you to try to change playback while you're not in a voice channel. >:(");
    } else if (streamDispatchers[msgSenderVoiceChannel] && streamDispatchers[msgSenderVoiceChannel].paused) {
        streamDispatchers[msgSenderVoiceChannel].resume();
    } else {
        changeSoundBasedOnCurrentPlaylistIndex(msg);
    }
}

function handlePauseCommand(msg, args) {
    let msgSenderVoiceChannel = msg.member.voice.channel;
    if (!msgSenderVoiceChannel) {
        handleErrorMessage(msg, handlePauseCommand.name, "It's rude for you to try to change playback while you're not in a voice channel. >:(");
    } else if (!streamDispatchers[msgSenderVoiceChannel]) {
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

    if (!msgSenderVoiceChannel) {
        handleErrorMessage(msg, handleVolumeCommand.name, "It's rude for you to try to change playback while you're not in a voice channel. >:(");
        return;
    }

    let volumeChanged = false;

    if (!isNaN(args[0]) && playlistInfo[msg.guild] && playlistInfo[msg.guild].volume !== args[0]) {
        playlistInfo[msg.guild].volume = args[0];
        volumeChanged = true;
    } else if (!isNaN(args[0]) && !playlistInfo[msg.guild]) {
        playlistInfo[msg.guild] = {
            "volume": args[0]
        };
        volumeChanged = true;
    }

    if (volumeChanged) {
        handleStatusMessage(msg, handleVolumeCommand.name, `Volume changed to \`${args[0]}\`.`)
    }

    if (!isNaN(args[0]) && streamDispatchers[msgSenderVoiceChannel]) {
        streamDispatchers[msgSenderVoiceChannel].setVolume(playlistInfo[msg.guild].volume);
    } else if (!isNaN(args[0]) && !streamDispatchers[msgSenderVoiceChannel]) {
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

const emojiFolder = "./bigEmoji/";
function refreshEmojiSystem() {
    let emojiFolderContents = fs.readdirSync(emojiFolder);
    for (let i = 0; i < emojiFolderContents.length; i++) {
        if (emojiFolderContents[i] === "README.md") {
            continue;
        }
        availableEmojis[emojiFolderContents[i].slice(0, -4).toLowerCase()] = emojiFolderContents[i];
    }
}

var availableEmojis = {};
function handleEmojiCommand(msg, args) {
    if (!args[0] || args[1]) {
        showCommandUsage(msg, "e");
        return;
    }

    refreshEmojiSystem();

    msg.channel.send({
        files: [
            {
                "attachment": emojiFolder + availableEmojis[args[0].toLowerCase()],
                "name": availableEmojis[args[0].toLowerCase()]
            }
        ]
    });
}

function formatAvailableEmojiNames(msg) {
    refreshEmojiSystem();
    return (Object.keys(availableEmojis).join(", "))
}

function getDominantColor(imagePath, callback) {
    if (!callback) {
        callback = function () { }
    }

    var imArgs = [imagePath, '-scale', '1x1\!', '-format', '%[pixel:u]', 'info:-']

    imageMagick.convert(imArgs, function (err, stdout) {
        if (err) {
            callback(err);
            return;
        }

        var rgba = stdout.slice(stdout.indexOf('(') + 1, stdout.indexOf(')')).split(',');
        var hex = rgbHex(stdout);
        callback(null, { "rgba": rgba, "hex": hex });
    });
}

function handleRoleColorCommand(msg, args) {
    if (args[0] && args[0] === "auto") {
        console.log(`Trying to automatially get the dominant color from ${msg.author.avatarURL()}...`);
        let filename = `${__dirname}${path.sep}temp${path.sep}${Date.now()}.${(msg.author.avatarURL()).split('.').pop().split('?')[0]}`;
        console.log(`Saving profile pic to ${filename}...`);
        const file = fs.createWriteStream(filename);
        const request = https.get(msg.author.avatarURL(), function (response) {
            response.pipe(file);
            file.on('finish', function () {
                file.close(function () {
                    console.log(`Saved profile pic to ${filename}!`);
                    console.log(`Trying to get dominant color...`);
                    getDominantColor(filename, function (err, outputColorObj) {
                        fs.unlinkSync(filename);

                        if (err) {
                            console.log(`Error when getting dominant color: ${err}`);
                            msg.channel.send("Yikes, something bad happened on my end. Sorry. Blame Zach.");
                            return;
                        }

                        let outputColorHex = outputColorObj.hex;

                        let outputColorRgba = outputColorObj.rgba;
                        let r = parseInt(outputColorRgba[0]);
                        let g = parseInt(outputColorRgba[1]);
                        let b = parseInt(outputColorRgba[2]);
                        let outputColorHue;
                        let maxRGB = Math.max(r, g, b);
                        let minRGB = Math.min(r, g, b);
                        if (maxRGB === r) {
                            outputColorHue = 60 * (g - b) / (maxRGB - minRGB);
                        } else if (maxRGB === g) {
                            outputColorHue = 60 * (2 + (b - r) / (maxRGB - minRGB));
                        } else {
                            outputColorHue = 60 * (4 + (r - g) / (maxRGB - minRGB));
                        }
                        outputColorHue = Math.round(outputColorHue);
                        if (outputColorHue < 0) {
                            outputColorHue += 360;
                        }
                        console.log(`\`outputColorHue\` is ${outputColorHue}`);

                        if (!outputColorHue) {
                            console.log(`Error when getting dominant color: No \`outputColorHue\`. outputColorObj: ${JSON.stringify(outputColorObj)}`);
                            msg.channel.send("Yikes, something bad happened on my end. Sorry. Blame Zach, and he'll check the logs.");
                            return;
                        }

                        let scheme = new ColorScheme;
                        scheme.from_hue(outputColorHue).scheme('contrast');
                        let colorSchemeColors = scheme.colors();
                        colorSchemeColors = colorSchemeColors.map(i => '#' + i);

                        if (outputColorHex.length === 8) {
                            outputColorHex = outputColorHex.slice(0, 6);
                        }
                        outputColorHex = `#${outputColorHex}`;

                        let guildMember = msg.member;
                        let memberRoles = guildMember.roles;
                        memberRoles.highest.setColor(outputColorHex, `User set their color automatically based on their profile picture.`)
                            .then(updated => {
                                console.log(`Automatically set color of role named ${memberRoles.highest} to ${outputColorHex} based on their profile picture: ${msg.author.avatarURL()}`);
                                msg.channel.send(`I've selected ${outputColorHex} for you. You might also like one of the following colors:\n${colorSchemeColors.join(', ')}`);
                            })
                            .catch(console.error);
                    });
                });
            });
        });
    } else if (args[0] && ((args[0].startsWith("#") && args[0].length === 7) || (args[0].length === 6))) {
        let hexColor = args[0].length === 6 ? "#" + args[0] : args[0];
        let guildMember = msg.member;
        let memberRoles = guildMember.roles;
        memberRoles.highest.setColor(hexColor, `User set their color manually.`)
            .then(updated => {
                console.log(`Set color of role named ${memberRoles.highest} to ${hexColor}.`);
                msg.channel.send(`Gorgeous.`);
            })
            .catch(console.error);
    } else {
        showCommandUsage(msg, "roleColor");
    }
}

function handleQuoteCommand(msg, args) {
    if (args[2]) {
        showCommandUsage(msg, "quote");
    } else if (args[1] && (args[0] === "del" || args[0] === "delete")) {
        // Delete the quote if possible
        let result = bot.deleteQuote.run(msg.guild.id, msg.channel.id, args[1]);

        // If the quote was deleted...
        if (result.changes > 0) {
            handleSuccessMessage(msg, handleQuoteCommand.name, `Quote with ID ${args[1]} deleted.`);
        } else {
            handleErrorMessage(msg, handleQuoteCommand.name, `Quote with ID ${args[1]} not found.`);
        }
    } else if (args[0]) {
        let result = bot.getQuote.get(msg.guild.id, msg.channel.id, args[0]);
        if (result) {
            handleSuccessMessage(msg, handleQuoteCommand.name, `Quote with ID ${args[0]} found.`, true);
            msg.channel.send(`#${result.id} ${result.quote}`);
        } else {
            handleErrorMessage(msg, handleQuoteCommand.name, 'No quote with that ID.');
        }
    } else {
        let result = bot.getRandomQuote.get(msg.guild.id, msg.channel.id);
        if (result) {
            msg.channel.send(`#${result.id} ${result.quote}`);
        }
    }
}

function handlePollCommand(msg, args) {
    showCommandUsage(msg, "poll");
}

// From https://www.w3resource.com/javascript-exercises/javascript-string-exercise-17.php
function stringChop2000(str, size) {
    if (str == null) {
        return [];
    }
    str = String(str);
    size = ~~size;
    return size > 0 ? str.match(/[\s\S]{1,2000}/g) : [str];
}

function handleWikiCommand(msg, args) {
    if (args[1] && (args[0] === "get")) {
        let result = bot.getWikiTopicContents.get(msg.guild.id, args[1]);
        if (result) {
            let msgToSend = `Wiki Contents for Topic "${result.topic}":\n\n${result.contents}`;
            let splitMsg = stringChop2000(msgToSend);
            splitMsg.forEach((strToSend) => {
                msg.channel.send(strToSend);
            });
        }
    } else if (args[1] && (args[0] === "set")) {
        let wikiTopic = {
            guild: msg.guild.id,
            topic: args[1],
            contents: msg.content.substring("!wiki".length + args[0].length + args[1].length + 3, msg.content.length) // +3 to account for spaces.
        };
        let id = bot.setWikiTopicContents.run(wikiTopic).lastInsertRowid;
        msg.channel.send(`In the Wiki for this server, I've set the contents of the topic "${args[1]}".`);
    } else {
        showCommandUsage(msg, "wiki");
    }
}

function handleBackupCommand(msg, args) {
    if (args[0] === "create") {
        if (!msg.member.hasPermission("ADMINISTRATOR")) {
            return msg.channel.send("You must be an administrator to create a backup.");
        }

        msg.channel.send(`Creating backup! This might take a while...`);

        discordBackup.setStorageFolder(`${__dirname}/backups/`);
        discordBackup.create(msg.guild, {
            jsonBeautify: true,
            jsonSave: true,
            saveImages: "base64"
        }).then((backupData) => {
            msg.author.send(`Backup created! To load it, use \`!backup load ${backupData.id}\` (NOT YET IMPLEMENTED).`);
            msg.channel.send(`:white_check_mark: Server backup created successfully. <@${msg.author.id}>, I sent you a DM containing the backup's ID.`);
        });
    } else if (args[1] && args[0] === "info") {
        let backupID = args[1];
        discordBackup.fetch(backupID).then((backupInfo) => {
            const backupDate = new Date(backupInfo.data.createdTimestamp);
            const yyyy = date.getFullYear().toString(), mm = (date.getMonth()+1).toString(), dd = date.getDate().toString();
            const formattedDate = `${yyyy}/${(mm[1]?mm:"0"+mm[0])}/${(dd[1]?dd:"0"+dd[0])}`;
            let embed = new Discord.MessageEmbed()
                .setAuthor(`Backup Information`)
                .addField(`Backup ID`, backupInfo.id, false)
                .addField(`Server ID`, backupInfo.data.guildID, false)
                .addField(`Size (KB)`, backupInfo.size, false)
                .addField(`Time Created`, formattedDate, false)
                .setColor(`#FF0000`);
            msg.channel.send(embed);
        }).catch((err) => {
            return msg.channel.send(`I couldn't find a backup with ID \`${backupID}\`.`);
        });
    } else {
        showCommandUsage(msg, "backup");
    }
}

const commandInvocationCharacter = "!";
const commandDictionary = {
    'y': {
        'description': 'Adds audio from a YouTube video to the Sounds Playlist.',
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
    'sbv': {
        'description': "Adds audio from the soundboard to the Sounds Playlist.",
        'argCombos': [
            {
                'argCombo': "Sound ID",
                "description": "Adds the audio associated with the Sound ID to the Sounds Playlist.",
                'handler': formatAvailableSoundIDs
            },
            {
                'argCombo': "Sound ID <Person>",
                "description": "Adds the audio associated with the Sound ID and the person to the Sounds Playlist. If you don't specify a person and there are two sounds with the same ID, the bot will pick between those people randomly."
            }
        ],
        'handler': handleSbvCommand
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
                'argCombo': 'goto <index to skip to>',
                'description': "Skips Sound Playlist playback directly to the specified index."
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
                'argCombo': 'volume',
                'description': 'The desired volume, from 0.1 to 2.0.'
            }
        ],
        'handler': handleVolumeCommand
    },
    'help': {
        'description': "Displays usage for all commands.",
        'argCombos': [
            {
                'argCombo': 'Optional. Command Argument',
                'description': 'Optional. Command argument to get help with.'
            }
        ],
        'handler': handleHelpCommand
    },
    'e': {
        'description': "Displays a BIG emoji image.",
        'argCombos': [
            {
                'argCombo': 'Emoji Name',
                'description': 'The name of the emoji to display.',
                'handler': formatAvailableEmojiNames
            }
        ],
        'handler': handleEmojiCommand
    },
    'roleColor': {
        'description': "Set's the user's role's color.",
        'argCombos': [
            {
                'argCombo': 'Hex Color',
                'description': "Sets the user's role color to the specified hex color."
            },
            {
                'argCombo': '"auto"',
                'description': "Sets the user's role color automatically based on their profile picture's colors."
            }
        ],
        'handler': handleRoleColorCommand
    },
    'quote': {
        'description': "The entry point into a robust quote saving/loading system. To start saving a quote, add the '🔠' emoji to some text. Quotes are persistent per server and channel combination.",
        'argCombos': [
            {
                'argCombo': '',
                'description': "Gets a random quote from the database that belongs to the channel in which you invoked the command."
            },
            {
                'argCombo': 'delete <id>',
                'description': "Deletes a quote from the database. You can only delete quotes from the database if the quote you're trying to delete was saved in the channel in which you invoke this command."
            }
        ],
        'handler': handleQuoteCommand
    },
    'wiki': {
        'description': `The entry point into a robust wiki-like system. Wiki entries are persistent for a given server.`,
        'argCombos': [
            {
                'argCombo': 'get <topic>',
                'description': 'Gets the contents of the specified topic and returns it to the channel where it was requested.'
            },
            {
                'argCombo': 'set <topic> <contents>',
                'description': 'Sets the contents of the specified topic to the specified contents. Older versions are preserved in the database _but are not accessible via the `wiki get` command_.'
            },
        ],
        'handler': handleWikiCommand
    },
    'poll': {
        'description': `The entry point into a poll system. Useful for things like scheduling times for a group to play games. To start a new poll, add the '❓' emoji to a message containing your poll question, then follow the instructions.`,
        'handler': handlePollCommand
    },
    'backup': {
        'description': `The entry point into a server backup system.`,
        'argCombos': [
            {
                'argCombo': 'create',
                'description': `Creates a new server backup and stores it in \`./backups/\`.`
            },
            {
                'argCombo': 'info <Backup ID>',
                'description': `Returns information about the latest backup.`
            },
        ],
        'handler': handleBackupCommand
    }
};

function isEmpty(obj) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

bot.on('message', msg => {
    if (msg.content.substring(0, 1) === commandInvocationCharacter) {
        console.log(`Got command in Guild \`${msg.guild}\`: ${msg.content}`);
        let args = msg.content.substring(1).split(' ');
        let command = args.splice(0, 1)[0];

        // If the "command" is actually an emoji, display the emoji instead of parsing the command.
        // This would seem like a bug if you named one of your emojis the same as one of the commands,
        // but I don't expect that to happen.
        if (isEmpty(availableEmojis)) {
            refreshEmojiSystem();
        }
        if (availableEmojis[command.toLowerCase()]) {
            msg.channel.send({
                files: [
                    {
                        "attachment": emojiFolder + availableEmojis[command.toLowerCase()],
                        "name": availableEmojis[command.toLowerCase()]
                    }
                ]
            });
            return;
        }

        if (commandDictionary[command] && commandDictionary[command].handler) {
            commandDictionary[command].handler(msg, args);
        } else if (!commandDictionary[command]) {
            let errorMsg = `There is no entry in the Command Dictionary associated with the command \`${commandInvocationCharacter + command}\`!`;
            handleErrorMessage(msg, "bot.on('message')", errorMsg, true);
        } else if (commandDictionary[command] && !commandDictionary[command].handler) {
            let errorMsg = `There is no handler in the Command Dictionary for the command \`${commandInvocationCharacter + command}\`!`;
            handleErrorMessage(msg, "bot.on('message')", errorMsg, true);
        }
    }
});

// Each new QuoteObject contains data about the quote that a user is currently constructing
function QuoteObject(quoteAdderObject, quoteGuild, quoteChannel, firstMessageObject, endQuoteMessageID) {
    this.quoteAdderObject = quoteAdderObject;
    this.quoteGuild = quoteGuild;
    this.quoteChannel = quoteChannel;
    this.messageObjectsInQuote = [firstMessageObject];
    this.endQuoteMessageID = endQuoteMessageID;
}
function formatQuote(quoteObject) {
    // formattedQuote will contain the return value, which is used, for example, for what we might store in the DB as the final quote.
    let formattedQuote = false;

    // For every message in the currentQuoteObject...
    let messageIDsUsed = [];
    while (quoteObject.messageObjectsInQuote.length !== messageIDsUsed.length) {
        // Find the oldest message in the array first...
        let currentOldestMessageObjectIndex = 0;
        let currentOldestMessageObject = null;
        for (let j = 0; j < quoteObject.messageObjectsInQuote.length; j++) {
            if (messageIDsUsed.includes(quoteObject.messageObjectsInQuote[j].id)) {
                continue;
            }

            if (!currentOldestMessageObject || quoteObject.messageObjectsInQuote[j].createdTimestamp < currentOldestMessageObject.createdTimestamp) {
                currentOldestMessageObjectIndex = j;
                currentOldestMessageObject = quoteObject.messageObjectsInQuote[currentOldestMessageObjectIndex];
            }
        }

        // Start the formatted quote text string with the date of the oldest message in the quote
        if (!formattedQuote) {
            let currentMessageTimestamp_YMD = moment(currentOldestMessageObject.createdTimestamp).format('YYYY-MM-DD')
            formattedQuote = currentMessageTimestamp_YMD;
        }

        // Grab some data about the current-oldest message object in our quoteObject...
        let currentPartOfQuoteAuthor = currentOldestMessageObject.author ? currentOldestMessageObject.author.toString() : "???";
        let currentPartOfQuoteTimestamp_formatted = moment(currentOldestMessageObject.createdTimestamp).format('hh:mm:ss');
        let currentPartOfQuoteContent = currentOldestMessageObject.content || "";
        if (currentOldestMessageObject.attachments) {
            currentPartOfQuoteContent += `\n`;
            currentOldestMessageObject.attachments.each((attachment) => {
                currentPartOfQuoteContent += `${attachment.url}\n`;
            });
        }

        // Add to the formatted quote
        formattedQuote += currentPartOfQuoteAuthor +
            " [" + currentPartOfQuoteTimestamp_formatted + "]: " + currentPartOfQuoteContent;

        messageIDsUsed.push(currentOldestMessageObject.id);
    }

    return formattedQuote;
}
// This array holds all of the quotes that the bot is currently keeping track of.
var activeQuoteObjects = [];
function getQuoteContinueMessage(userID) {
    let quoteContinueMessage = "keep tagging parts of the quote with 🔠 or react to this message with 🔚 to save it.";
    quoteContinueMessage = "<@" + userID + ">, " + quoteContinueMessage;
    return quoteContinueMessage;
}
function updateEndQuoteMessage(currentChannel, quoteObject) {
    // This message is posted right after a new user starts constructing a new quote.
    let quoteContinueMessage = getQuoteContinueMessage(quoteObject.quoteAdderObject.id);

    // Get the `Message` object associated with the `endQuoteMessageID` associated with the quote to which the user is adding.
    currentChannel.messages.fetch(quoteObject.endQuoteMessageID)
        .then(message => {
            // Edit the "Quote End Message" with a preview of the quote that the user is currently building.
            message.edit(quoteContinueMessage + "\nHere's a preview of your quote:\n\n" + formatQuote(quoteObject));
        })
        .catch(error => {
            console.error(`Couldn't fetch message associated with \`quoteObject.endQuoteMessageID\`.`);
        });
}
bot.on('messageReactionRemove', (reaction, user) => {
    if (reaction.emoji.name === "🔠" || reaction.emoji.name === "🔡") {
        // Start off this index at -1
        let currentActiveQuoteIndex = -1;
        // If it exists, find the quote object in the activeQuoteObjects array
        // that the user who reacted is currently constructing
        for (let i = 0; i < activeQuoteObjects.length; i++) {
            if (activeQuoteObjects[i].quoteAdderObject.toString() === user.toString()) {
                currentActiveQuoteIndex = i;
                break;
            }
        }

        if (currentActiveQuoteIndex > -1) {
            for (let i = 0; i < activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote.length; i++) {
                if (reaction.message.id === activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote[i].id) {
                    activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote.splice(i, 1);

                    if (activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote.length === 0) {
                        // Tell the user they bailed.
                        reaction.message.channel.messages.fetch(activeQuoteObjects[currentActiveQuoteIndex].endQuoteMessageID)
                            .then(message => {
                                // Edit the "Quote End Message" with a preview of the quote that the user is currently building.
                                message.edit(`<@${user.id}>, you have removed all messages from the quote you were building. Start a new one by reacting to a message with 🔠!`);
                                console.log(user.toString() + " bailed while adding a new quote.");
                            })
                            .catch(err => {
                                console.error(`Couldn't fetch message associated with \`activeQuoteObjects[currentActiveQuoteIndex].endQuoteMessageID\`.`);
                            });

                        // Remove the current QuoteObject from the activeQuoteObjects array
                        activeQuoteObjects.splice(currentActiveQuoteIndex, 1);
                        return;
                    }

                    // Update the end quote message with the new preview of the quote.
                    updateEndQuoteMessage(reaction.message.channel, activeQuoteObjects[currentActiveQuoteIndex]);
                    return;
                }
            }
        }
    } else if (reaction.emoji.name === "❓" || reaction.emoji.name === "❔") {
        let currentActivePollIndex = -1;
        for (let i = 0; i < activePollObjects.length; i++) {
            if (activePollObjects[i].pollAdderObject.toString() === user.toString()) {
                currentActivePollIndex = i;
                break;
            }
        }

        if (currentActivePollIndex > -1) {
            for (let i = 0; i < activePollObjects[currentActivePollIndex].messageObjectsInPoll.length; i++) {
                if (reaction.message.id === activePollObjects[currentActivePollIndex].messageObjectsInPoll[i].id) {
                    activePollObjects[currentActivePollIndex].messageObjectsInPoll.splice(i, 1);

                    if (activePollObjects[currentActivePollIndex].messageObjectsInPoll.length === 0) {
                        // Tell the user they bailed.
                        reaction.message.channel.messages.fetch(activePollObjects[currentActivePollIndex].endPollMessageID)
                            .then(message => {
                                // Edit the "Poll End Message" with a preview of the quote that the user is currently building.
                                message.edit(`<@${user.id}>, the poll is cancelled. Start a new one by reacting to a message with ❓!`);
                                console.log(user.toString() + " bailed while adding a new poll.");
                            })
                            .catch(err => {
                                console.error(`Couldn't fetch message associated with \`activePollObjects[currentActivePollIndex].endPollMessageID\`.`);
                            });

                        activePollObjects.splice(currentActivePollIndex, 1);
                        return;
                    }
                    return;
                }
            }
        }
    }
});

function handleQuoteReactionAdd(reaction, user) {// Start off this index at -1
    let currentActiveQuoteIndex = -1;
    // If it exists, find the quote object in the activeQuoteObjects array
    // that the user who reacted is currently constructing
    for (let i = 0; i < activeQuoteObjects.length; i++) {
        if (activeQuoteObjects[i].quoteAdderObject.toString() === user.toString()) {
            currentActiveQuoteIndex = i;
            break;
        }
    }

    // This message is posted right after a new user starts constructing a new quote.
    let quoteContinueMessage = getQuoteContinueMessage(user.id);

    if (currentActiveQuoteIndex === -1) {
        // This user is adding a new quote!
        console.log(user.username + " has started adding a new quote...");

        // Tell the user how to continue their quote, then push a new QuoteObject
        // to the activeQuoteObjects array to keep track of it
        reaction.message.channel.send(quoteContinueMessage)
            .then(message => {
                if (reaction.message.partial) {
                    reaction.message.fetch()
                        .then(fullmessage => {
                            currentActiveQuoteIndex = activeQuoteObjects.push(new QuoteObject(
                                user,
                                fullmessage.guild.id,
                                fullmessage.channel.id,
                                fullmessage,
                                message.id)
                            ) - 1;

                            updateEndQuoteMessage(reaction.message.channel, activeQuoteObjects[currentActiveQuoteIndex]);
                        })
                        .catch(err => {
                            console.error(`Couldn't fetch \`reaction.message\`.`);
                        });
                } else {
                    currentActiveQuoteIndex = activeQuoteObjects.push(new QuoteObject(
                        user,
                        reaction.message.guild.id,
                        reaction.message.channel.id,
                        reaction.message,
                        message.id)
                    ) - 1;

                    updateEndQuoteMessage(reaction.message.channel, activeQuoteObjects[currentActiveQuoteIndex]);
                }
            })
            .catch(err => {
                console.error(`Couldn't send \`quoteContinueMessage\`.`);
            });
    } else {
        // This user is updating an existing quote!
        console.log(user.username + " is updating an existing quote with internal index " + currentActiveQuoteIndex + "...");
        // Add the message that they reacted to to the relevant `QuoteObject` in `activeQuoteObjects`
        if (reaction.message.partial) {
            reaction.message.fetch()
                .then(fullmessage => {
                    activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote.push(fullmessage);
                    updateEndQuoteMessage(fullmessage.channel, activeQuoteObjects[currentActiveQuoteIndex]);
                })
                .catch(err => {
                    console.error(`Couldn't fetch \`reaction.message\`.`);
                });
        } else {
            activeQuoteObjects[currentActiveQuoteIndex].messageObjectsInQuote.push(reaction.message);
            updateEndQuoteMessage(reaction.message.channel, activeQuoteObjects[currentActiveQuoteIndex]);
        }
    }
}

function handleEndReactionAdd(reaction, user) {
    // The user reacted to a message with the "END" emoji...maybe they want to end a quote?
    let currentActiveQuoteIndex = -1;
    let currentActivePollIndex = -1;
    // If it exists, find the quote object in the activeQuoteObjects array
    // that the user who reacted is currently constructing
    for (let i = 0; i < activeQuoteObjects.length; i++) {
        if (activeQuoteObjects[i].endQuoteMessageID === reaction.message.id) {
            currentActiveQuoteIndex = i;
            break;
        }
    }
    for (let i = 0; i < activePollObjects.length; i++) {
        if (activePollObjects[i].endPollMessageID === reaction.message.id) {
            currentActivePollIndex = i;
            break;
        }
    }

    // If the currentActiveQuoteIndex is still at -1, that means the user isn't ending a quote,
    // and just happened to react to a message with the "END" emoji.
    if (currentActiveQuoteIndex > -1) {
        // The user who reacted is finishing up an active quote
        console.log(user.username + " has finished adding a new quote...");
        let currentQuoteObject = activeQuoteObjects[currentActiveQuoteIndex];
        let formattedQuote = formatQuote(currentQuoteObject);

        // Save the quote to the database
        let quote = {
            userWhoAdded: currentQuoteObject.quoteAdderObject.toString(),
            guild: currentQuoteObject.quoteGuild,
            channel: currentQuoteObject.quoteChannel,
            quote: formattedQuote
        };
        let id = bot.setQuote.run(quote).lastInsertRowid;
        reaction.message.channel.send("Quote added to database with ID " + id);

        reaction.message.channel.messages.fetch(currentQuoteObject.endQuoteMessageID)
            .then(endQuoteMessage => {
                endQuoteMessage.delete();
                currentQuoteObject.endQuoteMessageID = null;
            })
            .catch(err => {
                console.error(`Couldn't fetch \`currentQuoteObject.endQuoteMessageID\`.`);
            });

        // Remove the current QuoteObject from the activeQuoteObjects array
        activeQuoteObjects.splice(currentActiveQuoteIndex, 1);
    }

    if (currentActivePollIndex > -1) {
        console.log(user.username + " has finished creating a new poll...");
        let currentPollObject = activePollObjects[currentActivePollIndex];
        
        let formattedPollObj = formatPoll(currentPollObject);

        reaction.message.channel.send(formattedPollObj.message)
            .then((sentMessage) => {
                for (let i = 0; i < formattedPollObj.numPollOptions; i++) {
                    sentMessage.react(possiblePollReactions[i]);
                }
            })
            .catch(err => {
                console.error(`Couldn't send \`formattedPollObj.message\`.`);
            });

        activePollObjects.splice(currentActivePollIndex, 1);
    }
}

// This array holds all of the polls that the bot is currently keeping track of.
let activePollObjects = [];
let possiblePollReactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
function PollObject(pollAdderObject, pollGuild, pollChannel, firstMessageObject, endPollMessageID) {
    this.pollAdderObject = pollAdderObject;
    this.pollGuild = pollGuild;
    this.pollChannel = pollChannel;
    this.messageObjectsInPoll = [firstMessageObject];
    this.endPollMessageID = endPollMessageID;
}
function formatPoll(pollObject) {
    let retobj = {
        "message": false,
        "numPollOptions": pollObject.messageObjectsInPoll.length - 1, // `-1` to not count the poll question
    };

    if (retobj.numPollOptions > possiblePollReactions.length) {
        retobj.numPollOptions = 0;
        retobj.message = `Wow! Too many poll options for me. Try to create a poll with fewer than ${possiblePollReactions.length} options.`;
        return retobj;
    }

    let messageIDsUsed = [];
    let currentPollReactionIndex = 0;
    while (pollObject.messageObjectsInPoll.length !== messageIDsUsed.length) {
        let currentOldestMessageObjectIndex = 0;
        let currentOldestMessageObject = null;
        for (let j = 0; j < pollObject.messageObjectsInPoll.length; j++) {
            if (messageIDsUsed.includes(pollObject.messageObjectsInPoll[j].id)) {
                continue;
            }

            if (!currentOldestMessageObject || pollObject.messageObjectsInPoll[j].createdTimestamp < currentOldestMessageObject.createdTimestamp) {
                currentOldestMessageObjectIndex = j;
                currentOldestMessageObject = pollObject.messageObjectsInPoll[currentOldestMessageObjectIndex];
            }
        }

        if (!retobj.message) {
            retobj.message = `**${currentOldestMessageObject.content || ""}**\n`;
        } else {
            retobj.message += `\n${possiblePollReactions[currentPollReactionIndex]}: ${currentOldestMessageObject.content || ""}`;
            currentPollReactionIndex++;
        }

        messageIDsUsed.push(currentOldestMessageObject.id);
    }

    retobj.message += `\n\nReact to this message with the emoji associated with the poll option for which you want to vote. You can vote for more than one option.`;

    return retobj;
}
function getPollContinueMessage(userID) {
    let pollContinueMessage = "tag poll options with ❓. React to this message with 🔚 to save poll options and start polling.";
    pollContinueMessage = "<@" + userID + ">, " + pollContinueMessage;
    return pollContinueMessage;
}
function handlePollReactionAdd(reaction, user) {
    let currentActivePollIndex = -1;
    for (let i = 0; i < activePollObjects.length; i++) {
        console.log(activePollObjects[i].pollAdderObject.toString())
        console.log(user.toString())
        if (activePollObjects[i].pollAdderObject.toString() === user.toString()) {
            currentActivePollIndex = i;
            break;
        }
    }

    if (currentActivePollIndex === -1) {
        console.log(user.username + " has started creating a new poll...");
        
        let pollContinueMessage = getPollContinueMessage(user.id);

        reaction.message.channel.send(pollContinueMessage)
            .then(message => {
                if (reaction.message.partial) {
                    reaction.message.fetch()
                        .then(fullmessage => {
                            currentActivePollIndex = activePollObjects.push(new PollObject(
                                user,
                                fullmessage.guild.id,
                                fullmessage.channel.id,
                                fullmessage,
                                message.id)
                            ) - 1;
                        })
                        .catch(err => {
                            console.error(`Couldn't fetch \`reaction.message\`.`);
                        });
                } else {
                    currentActivePollIndex = activeQuoteObjects.push(new QuoteObject(
                        user,
                        reaction.message.guild.id,
                        reaction.message.channel.id,
                        reaction.message,
                        message.id)
                    ) - 1;
                }
            })
            .catch(err => {
                console.error(`Couldn't send \`pollContinueMessage\`.`);
            });
    } else {
        console.log(user.username + " is updating an existing poll with internal index " + currentActivePollIndex + "...");
        // Add the message that they reacted to to the relevant `QuoteObject` in `activeQuoteObjects`
        if (reaction.message.partial) {
            reaction.message.fetch()
                .then(fullmessage => {
                    activePollObjects[currentActivePollIndex].messageObjectsInPoll.push(fullmessage);
                })
                .catch(err => {
                    console.error(`Couldn't fetch \`reaction.message\`.`);
                });
        } else {
            activePollObjects[currentActivePollIndex].messageObjectsInPoll.push(reaction.message);
        }
    }
}

bot.on('messageReactionAdd', (reaction, user) => {
    // If the user reacted to a message with the "ABCD" emoji...
    if (reaction.emoji.name === "🔠" || reaction.emoji.name === "🔡") {
        handleQuoteReactionAdd(reaction, user);
    } else if (reaction.emoji.name === "❓" || reaction.emoji.name === "❔") {
        handlePollReactionAdd(reaction, user);
    } else if (reaction.emoji.name === "🔚") {
        handleEndReactionAdd(reaction, user);
    }
});

bot.login(auth.discordToken);
