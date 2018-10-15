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
var auth = require('./auth.json');
var fs = require('fs');
var moment = require('moment');

const SQLite = require("better-sqlite3");
const sql = new SQLite('./quotes/quotes.sqlite');

// Initialize discord.js Discord Bot
var bot = new Client();

// Log in with the auth token stored in `auth.json`
bot.login(auth.token);

// Don't handle any commands until `isReady` is set to true
var isReady = false;
// Used to determine the voice channel in which the bot is located
var currentVoiceChannel = false;
// Populated by the contents of the `bigEmoji` folder
var availableEmojis = [];
// Populated by the contents of the `sounds` folder
// Organized like:
// `sounds/<name of person who said sound>/<soundID>.mp3`
var soundboardData = { "data": {} };
// Used for sending status messages
var statusChannel;

// Do something when the bot says it's ready
bot.on('ready', function (evt) {
    // Set up the channel where we'll send status messages
    statusChannel = bot.channels.find(ch => ch.name === 'bot-test-zone');
    
    // Set to true when we've recorded all available emoji
    var emojiSystemReady = false;
    // Set to true when we've recorded all available soundboard sounds
    var soundboardSystemReady = false;
    // Call this after setting one of the subsystem's ready status to true
    var updateReadyStatus = function() {
        // We're ready for commands if all subsystems are ready!
        if (emojiSystemReady && soundboardSystemReady) {
            isReady = true;
            console.log('Bot ready.');
            statusChannel.send("Bot ready.");
        }
    }
    
    // Log that we're online
    console.log('Bot online.');
    
    // For every file in the `./bigEmoji` directory,
    // add that filename (minus extension) to our list
    // of available emoji.
    fs.readdir("./bigEmoji", (err, files) => {
        files.forEach(file => {
            availableEmojis.push(file.slice(0, -4));
        });
        emojiSystemReady = true;
        console.log('Emoji system ready.');
        updateReadyStatus();
    });
    
    // For every file in the `./sounds/*` directories,
    // add that filename (minus extension) to our list
    // of available soundboard sounds.
    // The keys in `soundboardData` correspond to the
    // sound filenames. The value with that key is a
    // `people` array containing the people who said that thing.
    // This is an array because sound filenames
    // don't have to be unique between people.
    fs.readdir("./sounds", (err, files) => {
        files.forEach(file => {
            fs.readdir("./sounds/" + file, (err, files) => {
                var person = file;
                files.forEach(subDirFile => {
                    var soundID = subDirFile.slice(0, -4);
                    
                    soundboardData.data[soundID] = {};
                    
                    if (!soundboardData.data[soundID]["people"]) {
                        soundboardData.data[soundID]["people"] = [];
                    }
                    
                    soundboardData.data[soundID]["people"].push(person);
                });
            });
        });
        
        soundboardSystemReady = true;
        console.log('Soundboard system ready.');
        updateReadyStatus();
        
        isReady = true;
    });
    
    // Check if the table "points" exists.
    const table = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'quotes';").get();
    if (!table['count(*)']) {
        // If the table isn't there, create it and setup the database correctly.
        sql.prepare("CREATE TABLE quotes (id INTEGER PRIMARY KEY, created DATETIME DEFAULT CURRENT_TIMESTAMP, userWhoAdded TEXT, guild TEXT, channel TEXT, quote TEXT);").run();
        // Ensure that the "id" row is always unique and indexed.
        sql.prepare("CREATE UNIQUE INDEX idx_quotes_id ON quotes (id);").run();
        sql.pragma("synchronous = 1");
        sql.pragma("journal_mode = wal");
    }

    // And then we have two prepared statements to get and set the score data.
    bot.getQuote = sql.prepare("SELECT * FROM quotes WHERE guild = ? AND channel = ? AND id = ?;");
    bot.getRandomQuote = sql.prepare("SELECT * FROM quotes WHERE guild = ? AND channel = ? ORDER BY random() LIMIT 1;");
    bot.setQuote = sql.prepare("INSERT OR REPLACE INTO quotes (userWhoAdded, guild, channel, quote) VALUES (@userWhoAdded, @guild, @channel, @quote);");
    bot.deleteQuote = sql.prepare("DELETE FROM quotes WHERE guild = ? AND channel = ? AND id = ?;");
});

// If a user says one of the messages on the left,
// the bot will respond with the message on the right
var exactMessageHandlers = {
    "cool cool cool": "cool cool cool cool cool cool",
    "ya gotta have your bot!": "ya just gotta!"
}

// Sent to the channel when a user enters an invalid command.
// key is command, value is error message.
// The keys in this object are used to enumerate the valid commands
// when the user issues the help command.
var errorMessages = {
    "e": 'invalid emoji. usage: !e <emoji name>.\navailable emojis:\n' + availableEmojis.join(", "),
    "sb": 'invalid arguments. usage: !sb <sound ID> <(optional) person',
    "sbv": 'invalid arguments. usage: !sbv <sound ID> <(optional) person>',
    "leave": "...i'm not in a voice channel",
    "quote": "add the '🔠' emoji to some text to get started. say !quote to get a random quote. use !quote delete <id> to delete a quote."
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
        // Split up arguments to the command based on spaces
        var args = message.content.substring(1).split(' ');
        // The command is the first "argument"
        var cmd = args[0];
        // After this operation, the `args` array will only contain arguments to `cmd`
        args = args.splice(1);
        
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
                    
                    // LOG IT
                    console.log("command: sb", "\nsoundID: " + soundID, "\nperson: " + person);
                    
                    // Attach the appropriate sound to the message.
                    message.channel.send({
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
                
                    // Set `currentVoiceChannel` to the voice channel
                    // that the user who issued the command is in
                    currentVoiceChannel = message.member.voiceChannel || false;
                    // If the user isn't in a voice channel...
                    if (!currentVoiceChannel) {
                        return message.channel.send("enter a voice channel first.");
                    }
                    
                    var filePath = "./sounds/" + person + "/" + soundID + '.mp3';
                    currentVoiceChannel.join()
                    .then(connection => {
                        // This only works completely when using discord.js v11 and Node.js v8
                        // Node.js v9 and newer won't play short files completely
                        // Apparently this is fixed in discord.js v12, but I couldn't get the master
                        // branch to work.
                        const dispatcher = connection.playFile(filePath);
                        // When the sound has finished playing...
                        dispatcher.on("end", end => {
                            // ...leave the voice channel.
                            currentVoiceChannel.leave();
                            currentVoiceChannel = false;
                        });
                    }).catch(console.error);
                    
                    console.log("command: sbv", "\nsoundID: " + soundID, "\nperson: " + person, "\npath: " + filePath + "\n");
                // If the user did not input a soundID...
                } else {
                    message.channel.send(errorMessages[cmd]);
                }
            break;
            // This command will force the bot to leave the voice channel that it's in.
            case 'leave':
                if (currentVoiceChannel) {
                    currentVoiceChannel.leave();
                    currentVoiceChannel = false;
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
    if (reaction.emoji.name === "🔠") {
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