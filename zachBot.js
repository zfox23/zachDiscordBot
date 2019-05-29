//
// zachBot.js
//
// Created by Zach Fox on 2018-10-13
//
// Distributed under the MIT License.
// See the accompanying LICENSE.txt file for details.
//

// Includes
const { Client } = require('discord.js');
const auth = require('./auth.json');
const fs = require('fs');
const moment = require('moment');
const ytdl = require('ytdl-core-discord');
const {google} = require('googleapis');
const {googleAuth} = require('google-auth-library');
const prism = require('prism-media');

const SQLite = require("better-sqlite3");
const quotesSQL = new SQLite('./quotes/quotes.sqlite');
const soundsSQL = new SQLite('./sounds/sounds.sqlite');
const playlistsSQL = new SQLite('./playlists/playlists.sqlite');

// Initialize discord.js Discord Bot
var bot = new Client();

// Log in with the `discordToken` auth token stored in `auth.json`
bot.login(auth.discordToken);
const youtubeAuthToken = auth.youtubeToken || false;

// Don't handle any commands until `isReady` is set to true
var isReady = false;
// Used to determine the voice channel in which the bot is located
var currentVoiceChannel = false;
// Used when connected to a voice channel
var currentVoiceConnection = false;
// Used when playing media
var currentStreamDispatcher = false;
// Used when playing YouTube video
var youtubeVolume = 0.3;
// Populated by the contents of the `bigEmoji` folder
var availableEmojis = [];
// Populated by the contents of the `sounds` folder
// Organized like:
// `sounds/<name of person who said sound>/<soundID>.mp3`
var soundboardData = { "data": {} };
// Used for sending status messages
var statusChannel;
// Sent to the channel when a user enters an invalid command.
// key is command, value is error message.
// The keys in this object are used to enumerate the valid commands
// when the user issues the help command.
var errorMessages = {
    "e": "", // Will be filled in once emoji system is ready
    "sb": 'invalid arguments. usage: !sb <sound ID> <(optional) person>',
    "sbv": 'invalid arguments. usage: !sbv <sound ID> <(optional) person>',
    "leave": "...i'm not in a voice channel",
    "quote": "add the '🔠' emoji to some text to get started. say !quote to get a random quote. use !quote delete <id> to delete a quote.",
    "soundStats": "invalid arguments. usage: !soundStats <*|(optional) sound ID> <(optional) person>",
    "y": "invalid arguments. usage: !y <search query|link to youtube video>",
    "yp": "invalid arguments. usage: !yp <list|next|back|clear|del|repeat> <(when del is the command) index | (when repeat is the command) none|one|all | (when list is the command) (optional) save|load|import> <(when list is the command) playlist name | (when list is the command) playlist URL> <(when importing a playlist from URL) playlist name>",
    "v": "invalid arguments. usage: !v <pause|resume|vol> <(optional) volume value>"
}

// Do something when the bot says it's ready
bot.on('ready', function (evt) {
    // Set up the channel where we'll send status messages
    statusChannel = bot.channels.find(ch => ch.name === 'bot-test-zone');
    
    // Set to true when we've recorded all available emoji
    var emojiSystemReady = false;
    // Set to true when we've recorded all available soundboard sounds
    var soundboardSystemReady = false;
    // Call this after setting one of the subsystem's ready status to true
    var firstReadyUpdateComplete = false;
    var updateReadyStatus = function() {
        // We're ready for commands if all subsystems are ready!
        isReady = emojiSystemReady && soundboardSystemReady;
        if (isReady) {
            if (!firstReadyUpdateComplete) {
                console.log('Bot ready.');
                statusChannel.send("Bot ready.");
            }
            firstReadyUpdateComplete = true;
        }
    }
    
    // Log that we're online
    console.log('Bot online.');
    
    // For every file in the `./bigEmoji` directory,
    // add that filename (minus extension) to our list
    // of available emoji.
    function refreshEmoji() {
        console.log('Refreshing emoji system...');
        emojiSystemReady = false;
        availableEmojis = [];
        var emojiFiles = fs.readdirSync("./bigEmoji");
        for (var i = 0; i < emojiFiles.length; i++) {
            if (emojiFiles[i] === "README.md") {
                continue;
            }
            availableEmojis.push(emojiFiles[i].slice(0, -4));
        }
        emojiSystemReady = true;
        updateReadyStatus();
        console.log('Emoji system ready.');
        errorMessages["e"] = ('invalid emoji. usage: !e <emoji name>.\navailable emojis:\n' + (availableEmojis.join(", ")));
    }
    var REFRESH_EMOJI_INTERVAL_MS = 3600000;
    var refreshEmojiInterval = setInterval(refreshEmoji, REFRESH_EMOJI_INTERVAL_MS);
    refreshEmoji();
    
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
    
    // Check if the table "sounds" exists.
    const soundsTable = soundsSQL.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'sounds';").get();
    if (!soundsTable['count(*)']) {
        // If the table isn't there, create it and setup the database correctly.
        soundsSQL.prepare("CREATE TABLE sounds (id INTEGER PRIMARY KEY, created DATETIME DEFAULT CURRENT_TIMESTAMP, soundAuthor TEXT, soundName TEXT, sbRequested INTEGER DEFAULT 0, sbvRequested INTEGER DEFAULT 0, UNIQUE(soundAuthor, soundName));").run();
        // Ensure that the "id" row is always unique and indexed.
        soundsSQL.prepare("CREATE UNIQUE INDEX idx_sounds_id ON sounds (id);").run();
        soundsSQL.pragma("synchronous = 1");
        soundsSQL.pragma("journal_mode = wal");
    }

    // We have some prepared statements to get and set sounds usage data.
    bot.incrementSBUsageData = soundsSQL.prepare("UPDATE sounds SET sbRequested = sbRequested + 1 WHERE soundAuthor = @soundAuthor AND soundName = @soundName;");
    bot.incrementSBVUsageData = soundsSQL.prepare("UPDATE sounds SET sbvRequested = sbvRequested + 1 WHERE soundAuthor = @soundAuthor AND soundName = @soundName;");
    bot.getSpecificSoundUsageData = soundsSQL.prepare("SELECT * FROM sounds WHERE soundName = ?;");
    bot.getSpecificSoundUsageDataByAuthor = soundsSQL.prepare("SELECT *, sbRequested + sbvRequested AS totalRequests FROM sounds WHERE soundAuthor = ? ORDER BY totalRequests DESC LIMIT 50;");
    bot.getSpecificSoundUsageDataWithAuthor = soundsSQL.prepare("SELECT * FROM sounds WHERE soundAuthor = ? AND soundName = ?;");
    bot.getTopTenSoundUsageData = soundsSQL.prepare("SELECT *, sbRequested + sbvRequested AS totalRequests FROM sounds ORDER BY totalRequests DESC LIMIT 10;");
    
    // Check if the table "playlists" exists.
    const playlistsTable = playlistsSQL.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'playlists';").get();
    if (!playlistsTable['count(*)']) {
        // If the table isn't there, create it and setup the database correctly.
        playlistsSQL.prepare("CREATE TABLE playlists (name TEXT PRIMARY KEY, created DATETIME DEFAULT CURRENT_TIMESTAMP, userWhoAdded TEXT, guild TEXT, channel TEXT, playlistJSON TEXT);").run();
        // Ensure that the "id" row is always unique and indexed.
        playlistsSQL.prepare("CREATE UNIQUE INDEX idx_playlists_name ON playlists (name);").run();
        playlistsSQL.pragma("synchronous = 1");
        playlistsSQL.pragma("journal_mode = wal");
    }
    bot.updatePlaylist = playlistsSQL.prepare("INSERT OR REPLACE INTO playlists (name, userWhoAdded, guild, channel, playlistJSON) VALUES (@name, @userWhoAdded, @guild, @channel, @playlistJSON);");
    bot.loadPlaylist = playlistsSQL.prepare("SELECT * FROM playlists WHERE guild = @guild AND channel = @channel AND name = @name;");
    
    // For every file in the `./sounds/*` directories,
    // add that filename (minus extension) to our list
    // of available soundboard sounds.
    // The keys in `soundboardData` correspond to the
    // sound filenames. The value with that key is a
    // `people` array containing the people who said that thing.
    // This is an array because sound filenames
    // don't have to be unique between people.
    var soundAuthors = fs.readdirSync("./sounds");
    for (var i = 0; i < soundAuthors.length; i++) {
        var currentAuthor = soundAuthors[i];
        
        if (currentAuthor === "README.md" || currentAuthor.indexOf("sounds.sqlite") > -1) {
            continue;
        }
        
        var soundIDs = fs.readdirSync("./sounds/" + currentAuthor);
        for (var j = 0; j < soundIDs.length; j++) {
            var soundID = soundIDs[j].slice(0, -4);

            // Add metadata about the current sound into the sounds table
            soundsSQL.prepare("INSERT OR IGNORE INTO sounds " + 
                "(soundAuthor, soundName, sbRequested, sbvRequested) VALUES ('" +
                currentAuthor + "', '" + soundID + "', 0, 0);").run();
            
            if (!soundboardData.data[soundID]) {
                soundboardData.data[soundID] = {};
            }
            
            if (!soundboardData.data[soundID]["people"]) {
                soundboardData.data[soundID]["people"] = [];
            }
            
            soundboardData.data[soundID]["people"].push(currentAuthor);
        }
    }
    
    soundboardSystemReady = true;
    console.log('Soundboard system ready.');
    updateReadyStatus();
});

// This event handler will ensure that, when a user adds/removes a reaction to a
// non-cached message, the reaction will still be caught by the bot.
// Snagged from
// https://github.com/AnIdiotsGuide/discordjs-bot-guide/blob/master/coding-guides/raw-events.md
// (THANK YOU!)
bot.on('raw', packet => {
    // We don't want this to run on unrelated packets
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
    // Grab the channel to check the message from
    const channel = bot.channels.get(packet.d.channel_id);
    // There's no need to emit if the message is cached, because the event will fire anyway for that
    if (channel.messages.has(packet.d.message_id)) return;
    // Since we have confirmed the message is not cached, let's fetch it
    channel.fetchMessage(packet.d.message_id).then(message => {
        // Emojis can have identifiers of name:id format, so we have to account for that case as well
        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
        // This gives us the reaction we need to emit the event properly, in top of the message object
        const reaction = message.reactions.get(emoji);
        // Check which type of event it is before emitting
        if (packet.t === 'MESSAGE_REACTION_ADD') {
            bot.emit('messageReactionAdd', reaction, bot.users.get(packet.d.user_id));
        }
        if (packet.t === 'MESSAGE_REACTION_REMOVE') {
            bot.emit('messageReactionRemove', reaction, bot.users.get(packet.d.user_id));
        }
    });
});

// If a user says one of the messages on the left,
// the bot will respond with the message on the right
const exactMessageHandlers = {
    "cool cool cool": "cool cool cool cool cool cool",
    "ya gotta have your bot!": "ya just gotta!"
}

function getYouTubeVideoTitleFromURL(youTubeURL, indexInPlaylist, callback) {
    if (!youtubeAuthToken) {
        console.log("You haven't set up a YouTube API key - this will fail silently!");
        return;
    }
    
    var videoId = youTubeURL.substr(-11);
    
    var youtubeService = google.youtube('v3');
    var parameters = {
        'maxResults': '1',
        'part': 'snippet',
        'q': videoId,
        'type': 'video',
        'regionCode': 'US'
    };
    parameters['auth'] = youtubeAuthToken;
    youtubeService.search.list(parameters, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var videoTitle = response.data.items[0].snippet.title;
        callback(videoTitle, indexInPlaylist, youTubeURL);
    });
}

function getFirstYouTubeResult(query, callback, errorCallback) {
    if (!youtubeAuthToken) {
        console.log("You haven't set up a YouTube API key - this will fail silently!");
        return;
    }
    
    var youtubeService = google.youtube('v3');
    var parameters = {
        'maxResults': '1',
        'part': 'snippet',
        'q': query,
        'type': 'video',
        'regionCode': 'US'
    };
    parameters['auth'] = youtubeAuthToken;
    youtubeService.search.list(parameters, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }

        if (response.data.items.length === 0) {
            errorCallback("No search results returned.");
            return;
        }

        var videoId = response.data.items[0].id.videoId;
        var fullUrl = "https://www.youtube.com/watch?v=" + videoId;
        var videoTitle = response.data.items[0].snippet.title;
        callback(fullUrl, videoTitle);
    });
}

var youTubePlaylist = [];
var currentYouTubePlaylistPosition = -1;
var youTubePlaylistRepeatMode = "none";

function handleNextInYouTubePlaylist() {
    if (youTubePlaylist.length > currentYouTubePlaylistPosition + 1) {
        currentYouTubePlaylistPosition++;
        handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition]);
    }
}

function handleBackInYouTubePlaylist() {
    if (currentYouTubePlaylistPosition !== 0) {
        currentYouTubePlaylistPosition--;
        handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition]);
    }
}

function handleListYouTubePlaylist(message) {
    var playlistArray = [];
    var numResponses = 0;
    if (youTubePlaylist.length === 0) {
        message.channel.send("Playlist is empty, boss!");
    } else {
        message.channel.send("Here's the current YouTube Playlist:\n");
        for (var i = 0; i < youTubePlaylist.length; i++) {
            getYouTubeVideoTitleFromURL(youTubePlaylist[i], i, function(title, index, originalURL) {
                indexString = index;
                if (index === currentYouTubePlaylistPosition && currentStreamDispatcher) {
                    indexString = "🎶 " + index;
                }
                playlistArray[index] = (`${indexString}. ${title} (\`${originalURL}\`)`);
                numResponses++;
                // This guarantees that the order of the playlist is the order
                // in which the playlist is displayed in-channel to the user
                if (numResponses === youTubePlaylist.length) {
                    message.channel.send(playlistArray.join("\n"));
                }
            });
        }
    }
}

function handleClearYouTubePlaylist(message) {
    youTubePlaylist = [];
    currentYouTubePlaylistPosition = -1;
    message.channel.send("YouTube playlist cleared.");
    
    // If there's something playing, stop it.
    if (currentStreamDispatcher) {
        currentStreamDispatcher.end('playlistCleared');
    }
}

function deleteIndexFromYouTubePlaylist(message, indexToDelete) {
    indexToDelete = parseInt(indexToDelete);
    if (!youTubePlaylist[indexToDelete]) {
        message.channel.send("That playlist item doesn't exist yet, friendo!");
        return;
    }
    
    youTubePlaylist.splice(indexToDelete, 1);
    message.channel.send(index + ". " + youTubePlaylist[indexToDelete] + ' deleted from playlist.');
    
    // If a user just deleted the song they're currently listening to,
    // stop the current song.
    if (indexToDelete === currentYouTubePlaylistPosition && currentStreamDispatcher) {
        currentStreamDispatcher.end('playlistIndexDeleted');
        // If the next song exists in the playlist...
        if (youTubePlaylist[currentYouTubePlaylistPosition]) {
            // ...play it immediately.
            handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition], message);
        } else {
            currentYouTubePlaylistPosition--;
        }
    }
}

async function playYouTubeAudio(currentVoiceConnection, url, options) {
    console.log(`playYouTubeAudio(): checkpoint 01`);
    const input = await ytdl(url);
    console.log(`playYouTubeAudio(): checkpoint 02`);
    const pcm = input.pipe(new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 }));
    console.log(`playYouTubeAudio(): checkpoint 03`);

    currentStreamDispatcher = currentVoiceConnection.playConvertedStream(pcm);
    console.log(`playYouTubeAudio(): checkpoint 04`);
    // When the sound has finished playing...
    currentStreamDispatcher.on("end", reason => {
        console.log(`Current Stream Dispatcher - End Event Received with Reason: ${reason}`);

        currentStreamDispatcher = false;
        if (!currentVoiceChannel) {
            return;
        }

        if (reason && reason !== "stream") {
            return;
        }
        
        if (youTubePlaylistRepeatMode === "one") {
            console.log(`Repeating that last video's audio...`);
            handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition], message);
        } else if (youTubePlaylistRepeatMode === "all" &&
            currentYouTubePlaylistPosition === (youTubePlaylist.length - 1)) {
            console.log(`Starting playlist from the beginning...`);
            currentYouTubePlaylistPosition = -1;
            handleNextInYouTubePlaylist();
        } else {
            console.log(`Calling handleNextInYouTubePlaylist()...`);
            handleNextInYouTubePlaylist();
        }
    });
}

function handleVoiceStream(filePathOrUrl, message) {
    var filePath = false;
    var youtubeUrlToPlay = false;
    
    // The assumption here is that the caller has already
    // verified that what's passed to `handleVoiceStream()` is
    // either a valid YouTube URL or a valid local file path.
    if (filePathOrUrl.indexOf("youtube.com") > -1) {
        youtubeUrlToPlay = filePathOrUrl;
    } else {
        filePath = filePathOrUrl;
    }
    
    var playAudio = function() {
        // If what we're trying to play is a local file...
        if (filePath) {
            if (currentStreamDispatcher) {
                currentStreamDispatcher.end('newAudio');
            }
            // This only works completely when using discord.js v11 and Node.js v8
            // Node.js v9 and newer won't play short files completely
            // Apparently this is fixed in discord.js v12, but I couldn't get the master
            // branch to work.
            currentStreamDispatcher = currentVoiceConnection.playFile(filePath);
            // When the sound has finished playing...
            currentStreamDispatcher.on("end", end => {
                currentStreamDispatcher = false;
            });
        } else if (youtubeUrlToPlay) {
            console.log(`handleVoiceStream -> playAudio -> ${youtubeUrlToPlay}...`);
            if (currentStreamDispatcher) {
                currentStreamDispatcher.end('newAudio');
            }
            var streamOptions = { volume: youtubeVolume, seek: 0 };
            playYouTubeAudio(currentVoiceConnection, youtubeUrlToPlay, streamOptions);
        } else {
            return console.log("What you want to play is not a file path or a YouTube URL.");
        }
    }
    
    // If the bot isn't already in a voice channel...
    if (!currentVoiceChannel) {
        // Set `currentVoiceChannel` to the voice channel
        // that the user who issued the command is in
        currentVoiceChannel = message.member.voiceChannel || false;
        
        // If the user isn't in a voice channel...
        if (!currentVoiceChannel) {
            if (message) {
                return message.channel.send("enter a voice channel first.");
            }
        }
    
        currentVoiceChannel.join()
        .then(connection => {
            currentVoiceConnection = connection;
            playAudio();
        }).catch(console.error);
    } else {
        if (!currentVoiceConnection) {
            if (message) {
                message.channel.send("for some reason, i'm in a voice channel but " +
                    "i don't have a voice connection :(");
            }
        } else {
            playAudio();
        }
    }
}

// Handle all incoming messages
bot.on('message', function (message) {
    // Don't do anything if we're not ready yet
    if (!isReady) {
        return;
    }
    
    // A little easter egg :) UB3R-B0T responds to "cool" with "cool cool cool".
    // If a user tries saying "cool cool cool" (and not UB3R-B0T), the bot will get mad :D
    if (message.content === "cool cool cool" && message.author.id !== "85614143951892480") {
        message.channel.send(">:(");
    // See `var exactMessageHandlers` above.
    } else if (message.content in exactMessageHandlers) {
        message.channel.send(exactMessageHandlers[message.content]);
    // If the very first character in a user's message is an "!", parse it as a command.
    } else if (message.content.substring(0, 1) == '!') {
        console.log("command: " + message.content);
        // Split up arguments to the command based on spaces
        var args = message.content.substring(1).split(' ');
        // The command is the first "argument"
        var cmd = args[0];
        // After this operation, the `args` array will only contain arguments to `cmd`
        args = args.splice(1);

		// If the "command" is actually an emoji, display the emoji instead of parsing the command.
		// This would seem like a bug if you named one of your emojis the same as one of the commands,
		// but I don't expect that to happen. That'd be weird.
		if (availableEmojis.indexOf(cmd) > -1) {
			message.channel.send({
				file: "./bigEmoji/" + availableEmojis[availableEmojis.indexOf(cmd)] + ".png"
			});
			return;
		}
        
        // Switch based on the command given
        switch(cmd) {
            // This command will display a big emoji in the channel
            case 'e':
                var emojiName = args[0];
                
                if (emojiName && availableEmojis.indexOf(emojiName) > -1) {
                    message.channel.send({
                        file: "./bigEmoji/" + emojiName + ".png"
                    });
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            // This command will display usage data about a sound
            case 'soundStats':
                var messageToSend = "";
                var result;
                    
                // This argument dictates which soundID the user wants info about
                if (args[0]) {
                    // If a user supplies this argument, they only want info about a soundID said by a specific person
                    if (args[1]) {
                        // If a user supplies this argument, they want stats about all of a specific person's sounds
                        if (args[0] === "*") {
                            result = bot.getSpecificSoundUsageDataByAuthor.all(args[1]);
                            
                            if (!result) {
                                messageToSend = "No results found for that person."
                            } else {
                                for (var i = 0; i < result.length; i++) {
                                    var numTimesRequested = result[i]["sbRequested"] + result[i]["sbvRequested"];
                                    
                                    messageToSend += '"' + result[i]["soundAuthor"] + " - " + result[i]["soundName"] +
                                    "\" requested " + numTimesRequested +
                                    " time" + (numTimesRequested === 1 ? "" : "s") + ".\n";
                                }
                            }
                        // If a user doesn't use "*" as args[0], they want stats about a soundID said by a specific person
                        } else {
                            result = bot.getSpecificSoundUsageDataWithAuthor.get(args[1], args[0]);
                            
                            if (!result) {
                                messageToSend = "No results found for that person and soundID."
                            } else {
                                var numTimesRequested = result["sbRequested"] + result["sbvRequested"];
                                
                                messageToSend += '"' + result["soundAuthor"] + " - " + result["soundName"] +
                                "\" requested " + numTimesRequested +
                                " time" + (numTimesRequested === 1 ? "" : "s") + ".\n";
                            }
                        }
                    // If a user just supplies a soundID, return stats data about sounds with that ID said by everyone who said it
                    } else {
                        result = bot.getSpecificSoundUsageData.all(args[0]);
                        
                        if (!result) {
                            messageToSend = "No results found for that soundID."
                        } else {
                            for (var i = 0; i < result.length; i++) {
                                var numTimesRequested = result[i]["sbRequested"] + result[i]["sbvRequested"];
                                
                                messageToSend += '"' + result[i]["soundAuthor"] + " - " + result[i]["soundName"] +
                                "\" requested " + numTimesRequested +
                                " time" + (numTimesRequested === 1 ? "" : "s") + ".\n";
                            }
                        }                        
                    }
                // No argument means they want total usage stats
                } else {
                    result = bot.getTopTenSoundUsageData.all();
                    for (var i = 0; i < result.length; i++) {
                        var numTimesRequested = result[i]["sbRequested"] + result[i]["sbvRequested"];
                        
                        messageToSend += '"' + result[i]["soundAuthor"] + " - " + result[i]["soundName"] +
                        "\" requested " + numTimesRequested +
                        " time" + (numTimesRequested === 1 ? "" : "s") + ".\n";
                    }
                }
                
                message.channel.send(messageToSend);
            break;
            // This command will upload a sound from the soundboard to the channel
            case 'sb':
                // If the user input a soundID...
                if (args[0]) {
                    var soundID = args[0];
                    var person = args[1];
                    
                    // If this isn't a valid soundID...
                    if (!soundboardData.data[soundID]) {
                        message.channel.send('soundID invalid. valid soundIDs:\n' + Object.keys(soundboardData.data).join(', ') + "\n\nsome soundids are said by more than 1 person. good luck figuring out who's who");
                        return;
                    // If the user input a person, but that person isn't associated
                    // with the input soundID...
                    } else if (person && soundboardData.data[soundID].people.indexOf(person) < 0) {
                        message.channel.send('person invalid. valid people for this sound:\n' + soundboardData.data[soundID].people.join(', '));
                        return;
                    }
                    
                    // If the user didn't input a person...
                    if (!person) {
                        // ...choose a random person associated with the soundID.
                        person = soundboardData.data[soundID].people[Math.floor(Math.random() * soundboardData.data[soundID].people.length)];
                    }
                    
                    var sbUsageData = {
                        soundAuthor: person,
                        soundName: soundID
                    }
                    var result = bot.incrementSBUsageData.run(sbUsageData);
                    result = bot.getSpecificSoundUsageDataWithAuthor.get(person, soundID);
                    var sbReplyMessage = "";
                    if (result) {
                        sbReplyMessage = '"' + person + " - " + soundID + "\" requested " +
                            (result.sbRequested + result.sbvRequested) +
                            " time" + (result.sbRequested + result.sbvRequested === 1 ? "" : "s") + ".";
                    }
                    
                    // Attach the appropriate sound to the message.
                    message.channel.send(sbReplyMessage, {
                        file: "./sounds/" + person + "/" + soundID + '.mp3'
                    });
                // If the user did not input a soundID...
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            // This command will speak a sound from the soundboard in the voice channel that the command
            // giver is in.
            case 'sbv':         
                // If the user input a soundID...       
                if (args[0]) {
                    var soundID = args[0];
                    var person = args[1];
                    
                    // If this isn't a valid soundID...
                    if (!soundboardData.data[soundID]) {
                        message.channel.send('soundID invalid. valid soundIDs:\n' + Object.keys(soundboardData.data).join(', ') + "\n\nsome soundids are said by more than 1 person. good luck figuring out who's who");
                        return;
                    // If the user input a person, but that person isn't associated
                    // with the input soundID...
                    } else if (person && soundboardData.data[soundID].people.indexOf(person) < 0) {
                        message.channel.send('person invalid. valid people for this sound:\n' + soundboardData.data[soundID].people.join(', '));
                        return;
                    }
                    
                    // If the user didn't input a person...
                    if (!person) {
                        // ...choose a random person associated with the soundID.
                        person = soundboardData.data[soundID].people[Math.floor(Math.random() * soundboardData.data[soundID].people.length)];
                    }
                    
                    var sbvUsageData = {
                        soundAuthor: person,
                        soundName: soundID
                    }
                    var result = bot.incrementSBVUsageData.run(sbvUsageData);
                    result = bot.getSpecificSoundUsageDataWithAuthor.get(person, soundID);
                    if (result) {
                        var sbvReplyMessage = '"' + person + " - " + soundID +
                            "\" requested " + (result.sbRequested + result.sbvRequested) +
                            " time" + (result.sbRequested + result.sbvRequested === 1 ? "" : "s") + ".";
                        message.channel.send(sbvReplyMessage);
                    }
                    
                    var filePath = "./sounds/" + person + "/" + soundID + '.mp3';
                    console.log("command: sbv", "\nsoundID: " + soundID, "\nperson: " + person, "\npath: " + filePath + "\n");
                    
                    
                    if (currentStreamDispatcher) {
                        currentStreamDispatcher.setVolume(1.0);
                    }
                    handleVoiceStream(filePath, message);
                // If the user did not input a soundID...
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            case 'y':
                if (args[0]) {
                    // If the user directly input a YouTube video to play...   
                    if (args[0].indexOf("youtube.com") > -1) {
                        message.channel.send(`Adding \`${args[0]}\` to the \`yp\`.`);
                        youTubePlaylist.push(args[0]);
    
                        if (!currentStreamDispatcher) {
                            currentYouTubePlaylistPosition++;
                            handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition], message);
                        }
                    // If the user is searching for a video...   
                    } else {
                        var searchQuery = args.join(' ');
                        getFirstYouTubeResult(searchQuery, function(youtubeUrl, title) {
                            message.channel.send(`Adding "${title}" from ${youtubeUrl} to the \`yp\``);
                            youTubePlaylist.push(youtubeUrl);
    
                            if (!currentStreamDispatcher) {
                                currentYouTubePlaylistPosition++;
                                handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition], message);
                            }
                        }, function() {
                            message.channel.send(`There were no YouTube results for the query "${searchQuery}"`);
                        });
                    }
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            case 'yp':
                if (args[0]) {
                    var playlistCommand = args[0];
                    if (playlistCommand === "next") {
                        handleNextInYouTubePlaylist();
                    } else if (playlistCommand === "back" || playlistCommand === "prev" || playlistCommand === "previous") {
                        handleBackInYouTubePlaylist();
                    } else if (playlistCommand === "list") {
                        if (args[1]) {
                            if (args[1] === "save") {
                                if (args[2]) {
                                    var playlistName = args[2];
                                    var playlistData = {
                                        name: playlistName,
                                        userWhoAdded: message.author.id,
                                        guild: message.guild.id,
                                        channel: message.channel.id,
                                        playlistJSON: JSON.stringify(youTubePlaylist)
                                    }
                                    var id = bot.updatePlaylist.run(playlistData).lastInsertRowid;
                                    message.channel.send("Playlist added to database with ID " + id);
                                } else {
                                    message.channel.send(`Please specify a playlist name: \`yp list save <playlist name>\``);
                                }
                            } else if (args[1] === "load") {
                                if (args[2]) {
                                    var playlistName = args[2];
                                    var requestData = {
                                        name: playlistName,
                                        guild: message.guild.id,
                                        channel: message.channel.id
                                    }
                                    var results = bot.loadPlaylist.get(requestData);
                                    if (results) {
                                        var playlistJSON = JSON.parse(results.playlistJSON);

                                        if (playlistJSON.length === 0) {
                                            message.channel.send(`That playlist didn't have any songs in it! Silly.`);
                                            return;
                                        }

                                        for (var i = 0; i < playlistJSON.length; i++) {
                                            youTubePlaylist.push(playlistJSON[i]);
                                        }
                                        message.channel.send(`Playlist loaded.`);
    
                                        if (!currentStreamDispatcher) {
                                            currentYouTubePlaylistPosition++;
                                            handleVoiceStream(youTubePlaylist[currentYouTubePlaylistPosition], message);
                                        }
                                    } else {
                                        message.channel.send(`I couldn't find a playlist named "${playlistName}" in my database.`);
                                    }
                                } else {
                                    message.channel.send(`Please specify a playlist name: \`yp list load <playlist name>\``);
                                }
                            } else if (args[1] === "show" || args[1] === "display") {
                                if (args[2]) {
                                    var playlistName = args[2];
                                    var requestData = {
                                        name: playlistName,
                                        guild: message.guild.id,
                                        channel: message.channel.id
                                    }
                                    var results = bot.loadPlaylist.get(requestData);
                                    if (results) {
                                        var playlistJSON = JSON.parse(results.playlistJSON);

                                        if (playlistJSON.length === 0) {
                                            message.channel.send(`That playlist didn't have any songs in it!`);
                                            return;
                                        }

                                        message.channel.send(`Here's the playlist called \`${playlistName}\`:`);
                                        var playlistArray = [];
                                        var numResponses = 0;
                                        for (var i = 0; i < playlistJSON.length; i++) {
                                            getYouTubeVideoTitleFromURL(playlistJSON[i], i, function(title, index, originalURL) {
                                                indexString = index;
                                                if (youTubePlaylist[currentYouTubePlaylistPosition] === originalURL && currentStreamDispatcher) {
                                                    indexString = "🎶 " + index;
                                                }
                                                playlistArray[index] = (`${indexString}. ${title} (\`${originalURL}\`)`);
                                                numResponses++;
                                                // This guarantees that the order of the playlist is the order
                                                // in which the playlist is displayed in-channel to the user
                                                if (numResponses === playlistJSON.length) {
                                                    message.channel.send(playlistArray.join("\n"));
                                                }
                                            });
                                        }
                                    } else {
                                        message.channel.send(`I couldn't find a playlist named "${playlistName}" in my database.`);
                                    }
                                } else {
                                    message.channel.send(`Please specify a playlist name: \`yp list show <playlist name>\``);
                                }
                            } else {
                                message.channel.send(errorMessages[cmd]);
                            }
                        } else {
                            handleListYouTubePlaylist(message);
                        }
                    } else if (playlistCommand === "clear") {
                        handleClearYouTubePlaylist(message);
                    } else if (playlistCommand === "del" || playlistCommand === "delete") {
                        if (args[1]) {
                            deleteIndexFromYouTubePlaylist(message, args[1]);
                        } else {
                            message.channel.send(errorMessages[cmd]);
                        }
                    } else if (playlistCommand === "repeat") {
                        if (args[1] === "none" || args[1] === "one" || args[1] === "all") {
                            youTubePlaylistRepeatMode = args[1];
                            message.channel.send("YouTube playlist repeat mode is now: " + youTubePlaylistRepeatMode);
                        } else {
                            message.channel.send("YouTube playlist repeat mode is currently: " + youTubePlaylistRepeatMode);
                        }
                    } else {
                        message.channel.send(errorMessages[cmd]);
                    }
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            case 'next':
                handleNextInYouTubePlaylist();
            break;
            case 'back':
            case 'prev':
            case 'previous':
                handleBackInYouTubePlaylist();
            break;
            case 'pause':
                if (currentStreamDispatcher) {
                    currentStreamDispatcher.pause();
                }
            break;
            case 'resume':
                if (currentStreamDispatcher) {
                    currentStreamDispatcher.resume();
                }
            break;
            case 'v':
                if (args[0]) {
                    if (args[0] === "pause") {
                        if (currentStreamDispatcher) {
                            currentStreamDispatcher.pause();
                        }
                    } else if (args[0] === "resume" || args[0] === "play") {
                        if (currentStreamDispatcher) {
                            currentStreamDispatcher.resume();
                        }
                    } else if (args[0] === "vol" || args[0] === "volume") {
                        if (args[1]) {
                            var volume = parseFloat(args[1]);
                            if (volume <= 2 && volume >= 0) {
                                youtubeVolume = volume;
                                message.channel.send("set youtube music volume to " + youtubeVolume);

                                if (currentStreamDispatcher) {
                                    var currentVolume = currentStreamDispatcher.volume;
                                    var stepSize = (youtubeVolume - currentVolume) / 20;
                                    var counter = 0;
                                    var interval = setInterval(function() {
                                        currentVolume = currentStreamDispatcher.volume;
                                        if (counter >= 20) {
                                            clearInterval(interval);
                                            return;
                                        } else {
                                            currentStreamDispatcher.setVolume(currentVolume + stepSize);
                                        }
                                        counter++;
                                    }, 10);
                                }
                            } else {
                                message.channel.send("volume must be between 0 and 2");
                            }
                        } else {
                            if (currentStreamDispatcher) {
                                message.channel.send(currentStreamDispatcher.volume);
                            } else {
                                message.channel.send("There's no `currentStreamDispatcher`, boss! Start playin' something!");
                            }
                        }
                    }                    
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            // This command will force the bot to leave the voice channel that it's in.
            case 'leave':
                if (currentVoiceChannel) {
                    if (currentStreamDispatcher) {
                        currentStreamDispatcher.end('leaving');
                        currentStreamDispatcher = false;
                    }
                    currentVoiceChannel.leave();
                    currentVoiceChannel = false;
                    currentVoiceConnection = false;
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            // These commands will display the help message
            case 'help':
            case 'commands':
            case 'halp':
                const helpMsg = "current commands:\n!" + Object.keys(errorMessages).join('\n!');
                message.channel.send(helpMsg);
            break;
            // Handles quote database operations
            case 'quote':
                var messageToSend = false;
                // There shouldn't be more than one argument.
                if (args[2]) {
                    message.channel.send(errorMessages[cmd]);
                    return;
                // If there are 2 arguments...
                } else if (args[1]) {
                    // ...and the argument ISN'T "delete"
                    if (args[0].toLowerCase() !== "delete") {
                        message.channel.send(errorMessages[cmd]);
                        return;
                    }
                    
                    // delete the quote if possible
                    var result = bot.deleteQuote.run(message.guild.id, message.channel.id, args[1]);
                    
                    // If the quote was deleted...
                    if (result.changes > 0) {
                        messageToSend = "quote with id " + args[1] + " deleted.";
                    } else {
                        messageToSend = "quote with id " + args[1] + " not found.";
                    }
                // If there's one argument...
                } else if (args[0]) {
                    // ...get the quote with that ID from the DB (if it exists)
                    var result = bot.getQuote.get(message.guild.id, message.channel.id, args[0]);
                    if (result) {
                        messageToSend = "#" + result.id + " " + result.quote;
                    } else {
                        messageToSend = "no quotes with that ID";
                    }
                // No arguments...
                } else {
                    // ...get a random quote from the DB
                    var result = bot.getRandomQuote.get(message.guild.id, message.channel.id);
                    if (result) {
                        messageToSend = "#" + result.id + " " + result.quote;
                    }
                }
                
                // Send the relevant message to the channel
                message.channel.send(messageToSend || "you haven't saved any quotes in this channel yet");
            break;
         }
     // See `var botMentionMessageHandlers` below.
     } else if (message.content.includes("<@500452185314820107>") && message.author.id !== "500452185314820107") {
        // Used below :)
        const greetings = ["sup?", "howdy, pard!", "ayyo :)", "g'day!", "trevor hacked me once", "guten tag c:"];
        // If a user @mentions the bot, and their message contains
        // one of the strings on the left (case insensitive),
        // the bot will respond with one of the messages on the right at random
        const botMentionMessageHandlers = {
            "fuck you": ["NO FCUK YUOU"],
            "yo": greetings,
            "hey": greetings,
            "hi": greetings,
            "bye": ["no"]
        }
        
        var lowerCaseMessage = message.content.toLowerCase();
        
        for (var key in botMentionMessageHandlers) {
            if (lowerCaseMessage.includes(key)) {
                message.channel.send(botMentionMessageHandlers[key][Math.floor(Math.random() * botMentionMessageHandlers[key].length)]);
            }
        }
    }
});

// Everything below this comment is related to the quote database system.
// This message is posted right after a new user starts constructing a new quote.
const quoteContinueMessage = "keep tagging parts of the quote with 🔠 or react to this message with 🔚 to save it.";
// Each new QuoteObject contains data about the quote that a user is currently constructing
function QuoteObject(quoteAdder, quoteGuild, quoteChannel, firstMessageObject, endQuoteMessageID) {
    this.quoteAdder = quoteAdder;
    this.quoteGuild = quoteGuild;
    this.quoteChannel = quoteChannel;
    this.messageObjectsInQuote = [firstMessageObject];
    this.endQuoteMessageID = endQuoteMessageID;
}
// This array holds all of the quotes that the bot is currently keeping track of.
var activeQuoteObjects = [];
bot.on('messageReactionAdd', (reaction, user) => {
    // If the user reacted to a message with the "ABCD" emoji...
    if (reaction.emoji.name === "🔠" || reaction.emoji.name === "🔡") {
        if (!reaction.message.content || reaction.message.content.length <= 0) {
            reaction.message.channel.send(`<@${user.id}>: I can't save messages that don't contain any text, so the message you just tagged won't be included in your quote.`);
            return;
        }

        // Start off this index at -1
        var currentActiveQuoteIndex = -1;
        // If it exists, find the quote object in the activeQuoteObjects array
        // that the user who reacted is currently constructing
        for (var i = 0; i < activeQuoteObjects.length; i++) {
            if (activeQuoteObjects[i].quoteAdder === user.toString()) {
                currentActiveQuoteIndex = i;
                break;
            }
        }
        
        if (currentActiveQuoteIndex === -1) {
            // This user is adding a new quote!
            console.log(user.toString() + " has started adding a new quote...");
            
            // Tell the user how to continue their quote, then push a new QuoteObject
            // to the activeQuoteObjects array to keep track of it
            reaction.message.channel.send("<@" + user.id + ">, " + quoteContinueMessage)
            .then(message => {
                activeQuoteObjects.push(new QuoteObject(
                    user.toString(),
                    reaction.message.guild.id,
                    reaction.message.channel.id,
                    reaction.message,
                    message.id)
                );
            });
        } else {
            // This user is updating an existing quote!
            console.log(user.toString() + " is updating an existing quote with internal index " + i + "...");
            // Add the message that they reacted to to the relevant QuoteObject in activeQuoteObjects
            activeQuoteObjects[i].messageObjectsInQuote.push(reaction.message);
        }
    } else if (reaction.emoji.name === "🔚") {
        // The user reacted to a message with the "END" emoji...maybe they want to end a quote?
        var currentActiveQuoteIndex = -1;
        // If it exists, find the quote object in the activeQuoteObjects array
        // that the user who reacted is currently constructing
        for (var i = 0; i < activeQuoteObjects.length; i++) {
            if (activeQuoteObjects[i].endQuoteMessageID === reaction.message.id) {
                currentActiveQuoteIndex = i;
                break;
            }
        }
        
        // If the currentActiveQuoteIndex is still at -1, that means the user isn't ending a quote,
        // and just happened to react to a message with the "END" emoji.
        if (currentActiveQuoteIndex > -1) {
            // The user who reacted is finishing up an active quote
            console.log(user.toString() + " has finished adding a new quote...");
            var currentQuoteObject = activeQuoteObjects[i];
            // formattedQuote will contain what we store in the DB as the final quote.
            var formattedQuote = false;
            
            // For every message in the currentQuoteObject...
            while (currentQuoteObject.messageObjectsInQuote.length > 0) {
                // Find the oldest message in the array first...
                var currentOldestMessageObjectIndex = 0;
                var currentOldestMessageObject = currentQuoteObject.messageObjectsInQuote[currentOldestMessageObjectIndex];
                for (var j = 0; j < currentQuoteObject.messageObjectsInQuote.length; j++) {
                    if (currentQuoteObject.messageObjectsInQuote[j].createdTimestamp < currentOldestMessageObject.createdTimestamp) {
                        currentOldestMessageObjectIndex = j;
                        currentOldestMessageObject = currentQuoteObject.messageObjectsInQuote[currentOldestMessageObjectIndex];
                    }
                }
                
                // Start the formatted quote text string with the date of the oldest message in the quote
                if (!formattedQuote) {
                    var currentMessageTimestamp_YMD = moment(currentOldestMessageObject.createdTimestamp).format('YYYY-MM-DD')
                    formattedQuote = currentMessageTimestamp_YMD;
                }
                
                // Grab some data about the current-oldest message object in our currentQuoteObject...
                var currentPartOfQuoteAuthor = currentOldestMessageObject.author.toString();
                var currentPartOfQuoteTimestamp_formatted = moment(currentOldestMessageObject.createdTimestamp).format('hh:mm:ss');
                var currentPartOfQuotecontent = currentOldestMessageObject.content;
                
                // Add to the formatted quote
                formattedQuote += "\n" + currentPartOfQuoteAuthor +
                    " [" + currentPartOfQuoteTimestamp_formatted + "]: " + currentPartOfQuotecontent;
                
                // Remove the currentOldestMessageObject from the messageObjectsInQuote in the currentQuoteObject
                currentQuoteObject.messageObjectsInQuote.splice(currentOldestMessageObjectIndex, 1);
            }
            
            // Save the quote to the database
            var quote = {
                userWhoAdded: activeQuoteObjects[i].quoteAdder,
                guild: activeQuoteObjects[i].quoteGuild,
                channel: activeQuoteObjects[i].quoteChannel,
                quote: formattedQuote
            }
            var id = bot.setQuote.run(quote).lastInsertRowid;
            reaction.message.channel.send("Quote added to database with ID " + id);
            
            // Remove the current QuoteObject from the activeQuoteObjects array
            activeQuoteObjects.splice(currentActiveQuoteIndex, 1);
        }
    }
});