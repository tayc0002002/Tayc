require('./config.js');
const { fetchBuffer, GETSETTINGS, isAdmin, smsg, GETPRIVACY, LOADSETTINGS, getFolderSizeInMB, sleep } = require('./lib/myfunc');
const fs = require('fs');
const os = require('os')
const { execSync } = require('child_process');
const path = require('path');
const process = require('process')
const { performance } = require('perf_hooks')
const moment = require('moment-timezone')

const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('./lib/index');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Antilink } = require('./lib/antilink');
const { handleDemotionEvent } = require('./commands/demote');


const TEMP_MEDIA_DIR = path.join(__dirname, './tmp');
const { writeFile } = require('fs/promises');
const logMessage = require('./src/lib/statique.js');
const { getCommands } = require('./src/lib/loader.js');
const chalk = require('chalk');
const { handleChatbotResponse } = require('./commands/chatbot.js');
const { handleBadwordDetection } = require('./lib/antibadword.js');
const { FORWARDMESSAGE, estimateForwardTime, getForwardStatus, stopForwarding } = require('./src/lib/forwarder.js');

const messageStore = new Map();
const ALL_CHAT_PATH = path.join(__dirname, './src/db/chats.json');
const ALL_SETTINGS_PATH = path.join(__dirname, './src/db/settings.json');
const ALL_CONTACTS_PATH = path.join(__dirname, "./src/db/contacts.json")

// Making sure tmp exist 
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        if (sizeMB > 100) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
                else fs.rmSync(filePath, { recursive: true, force: true });
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

setInterval(cleanTempFolderIfLarge, 60 * 1000);


function loadAllChats() {
    try {
        const raw = fs.readFileSync(ALL_CHAT_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function saveAllChats(data) {
    fs.writeFileSync(ALL_CHAT_PATH, JSON.stringify(data, null, 2));
}

function addToGlobalHistory(jid, role, text) {
    const allChats = loadAllChats();
    if (!allChats[jid]) allChats[jid] = [];
    allChats[jid].push({
        role,
        text,
        timestamp: new Date().toISOString()
    });
    if (allChats[jid].length > 20) allChats[jid].shift();
    saveAllChats(allChats);
}
/**
 * 
 * @param {object} newSettings 
 */

function saveNewSetting(newSettings) {
    fs.writeFileSync(ALL_SETTINGS_PATH, JSON.stringify(newSettings, null, 2));
}


async function handleMessages(Tayc, messageUpdate) {
    try {
        const settings = GETSETTINGS();
        const COMMANDS = getCommands();
        const prefix = settings.prefix;
        const sudoList = GETPRIVACY().sudo || [];
        const taycMode = settings.mode
        const { messages, type } = messageUpdate;
        if (type !== 'notify' || !messages || messages.length === 0) return;

        const message = messages[0];
        if (message.key?.remoteJid?.endsWith("@newsletter")) return;

        const m = await smsg(Tayc, message);
        //  console.log(m);

        if (!m || !m.body) return;

        const chatId = m.chat;
        const senderJid = m.sender;
        const fromGroup = m.isGroup;
        const botNumber = Tayc.user.id;
        const isBotAdmin = m.fromMe || sudoList.includes(senderJid);

        const simulatePresence = async (type = null, duration = 3000) => {
            try {
                await sleep(2000)
                const types = ['recording', 'composing'];
                const presenceType = type && types.includes(type) ? type : types[Math.floor(Math.random() * types.length)];
                await Tayc.sendPresenceUpdate(presenceType, chatId);
                await sleep(duration);
                await Tayc.sendPresenceUpdate('available', chatId);
            } catch { }
        }

        const markAsRead = async () => {
            await Tayc.readMessages([m.key]);
        }

        // === Autoread ===

        if (
            (["private", "pm"].includes(settings.autoread) && !fromGroup && !m.fromMe) ||
            (settings.autoread === "group" && fromGroup && !m.fromMe) ||
            settings.autoread === "all"
        ) {
            await markAsRead();
        }
        // === Simulated record or type ===
        if (
            (["private", "pm"].includes(settings.autorecordtype) && !fromGroup && !m.fromMe) ||
            (settings.autorecordtype === "group" && fromGroup && !m.fromMe) ||
            settings.autorecordtype === "all"
        ) {
            await simulatePresence();
        }

        // === UTILITIES ===
        const reply = (text, mentions = []) => Tayc.sendMessage(chatId, { text, mentions }, { quoted: m });
        const sendText = async (text) => await Tayc.sendMessage(chatId, { text });
        const sendPrivate = async (text, mentions = []) => await Tayc.sendMessage(botNumber, { text, mentions })

        const react = async (emoji) => await Tayc.sendMessage(chatId, {
            react: { text: emoji, key: m.key }
        });

        logMessage(Tayc, m);

        // === Receive contact ===
        if (["contactMessage", "contactsArrayMessage"].includes(m.mtype)) {
            await handleContactDetected(Tayc, m, settings.awc, sendPrivate);
            return;
        }

        await storeMessage(m, m.fromMe);

        // === Message revoked ===
        if (m.mtype === 'protocolMessage' && m.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(Tayc, m, botNumber);
            return;
        }

        // === Edit message ===
        if (m.message?.protocolMessage?.type === 14) {
            await handleMessageEdit(Tayc, message, botNumber);
            return;
        }

        // === Antilink / Badwords ===
        if (fromGroup && m.body) {
            await handleBadwordDetection(Tayc, chatId, m, m.body.toLowerCase(), senderJid);
            await Antilink(m, Tayc);
        }


        // === Chatbot mode ===
        if (!m.body.startsWith(prefix) && !fromGroup && settings.chatbot === "on") {
            await handleChatbotResponse(Tayc, chatId, m, m.body.toLowerCase(), senderJid);
            return;
        }

        // === Build context ===
        const context = {
            sendPrivate,// Send message private to the bot admin
            Tayc,                  // client instance
            sendText,              // async send text
            reply,                 // reply with quoted
            react,                 // react with emoji
            m,                     // formatted message object
            key: m.key,            // key object
            body: m.body,          // raw body
            quoted: m.quoted,
            chatId,                // JID
            sender: senderJid,     // sender JID
            isGroup: fromGroup,
            isBotAdmin,            // whether it's an admin or sudo
            isOwner: isBotAdmin,   // alias
            isBotUser: m.fromMe,
            botNumber,             // bot number
            prefix,
            from: chatId,          // alias
            botMode: settings.mode,
            settings,              // full bot settings
            participants: m.participants || [],
            groupMetadata: m.groupMetadata || {},
            quotedMessage: m.quoted?.text || null,
            command: '',
            simulatePresence,
            markAsRead,
            FORWARDMESSAGE,
            estimateForwardTime,
            getForwardStatus,
            stopForwarding,
            args: [],
            text: "",
            Settings: LOADSETTINGS(),
            saveNewSetting, // function to save new settings
            full: '',
            cmd: "",
            raw: message           // original Baileys message
        };

        // === Command handling ===
        if (m.body.startsWith(prefix)) {
            const body = m.body.slice(prefix.length).trim();
            const commandName = body.split(' ')[0].toLowerCase();
            const args = body.split(' ').slice(1);

            context.args = args;
            context.full = body;// full command text
            context.text = args.join(" ")
            context.command = commandName;
            context.cmd = prefix + commandName
            const matched = COMMANDS.find(cmd =>
                Array.isArray(cmd.command) ? cmd.command.includes(commandName) : cmd.command === commandName
            );

            if (!matched) return

            if (taycMode === "private" && !context.isOwner && !context.isBotUser) {
                react("❌")
                await reply("*Take Your own access to Take All You Can*")
                return
            }
            if (["menu", "restart", "update", "help"].includes(commandName)) return handleCommand(context)

            if (typeof matched.operate === 'function') {
                try {

                    console.log(chalk.gray(`[TAYC-CMD] Executing: ${commandName} in ${matched.__source}`));
                    await matched.operate(context);
                } catch (err) {
                    console.error(`❌ Error in command "${matched.command}":`, err);
                    await reply("❌ An error occurred while executing the command.");
                }
            }
        }

    } catch (error) {
        console.error('❌ Error in handleMessages:', error);
        await Tayc.sendMessage(Tayc.user.id, {
            text: '❌ Message handling failed:\n\n' + error.message,
        });
    }
}

async function handleGroupParticipantUpdate(Tayc, update) {
    try {
        const { id, participants, action, author } = update;

        // Check if it's a group
        if (!id.endsWith('@g.us')) return;

        // Handle promotion events
        if (action === 'promote') {
            await handlePromotionEvent(Tayc, id, participants, author);
            return;
        }

        // Handle demotion events
        if (action === 'demote') {
            await handleDemotionEvent(Tayc, id, participants, author);
            return;
        }

        // Handle join events
        if (action === 'add') {
            // Check if welcome is enabled for this group
            const isWelcomeEnabled = await isWelcomeOn(id);
            if (!isWelcomeEnabled) return;

            // Get group metadata
            const groupMetadata = await Tayc.groupMetadata(id);
            const groupName = groupMetadata.subject;
            const groupDesc = groupMetadata.desc || 'No description available';

            // Get welcome message from data
            const data = JSON.parse(fs.readFileSync('./data/userGroupData.json'));
            const welcomeData = data.welcome[id];
            const welcomeMessage = welcomeData?.message || 'Welcome {user} to the group! 🎉';
            const channelId = welcomeData?.channelId || '120363398106360290@newsletter';

            // Send welcome message for each new participant
            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = welcomeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName)
                    .replace('{description}', groupDesc);

                await Tayc.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant],
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: channelId,
                            newsletterName: 'BWB XMD',
                            serverMessageId: -1
                        }
                    }
                });
            }
        }

        // Handle leave events
        if (action === 'remove') {
            // Check if goodbye is enabled for this group
            const isGoodbyeEnabled = await isGoodByeOn(id);
            if (!isGoodbyeEnabled) return;

            // Get group metadata
            const groupMetadata = await Tayc.groupMetadata(id);
            const groupName = groupMetadata.subject;

            // Get goodbye message from data
            const data = JSON.parse(fs.readFileSync('./data/userGroupData.json'));
            const goodbyeData = data.goodbye[id];
            const goodbyeMessage = goodbyeData?.message || 'Goodbye {user} 👋';
            const channelId = goodbyeData?.channelId || '120363398106360290@newsletter';

            // Send goodbye message for each leaving participant
            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = goodbyeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName);

                await Tayc.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant],
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: channelId,
                            newsletterName: 'BWB XMD',
                            serverMessageId: -1
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}



// Créer un dossier daté et retourner un chemin
function getMediaPath(messageId, ext) {
    const day = new Date().toISOString().slice(0, 10);
    const dayDir = path.join(TEMP_MEDIA_DIR, day);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });
    return path.join(dayDir, `${messageId}${ext}`);
}

// Sauvegarde des messages
async function storeMessage(message, isUser) {
    try {

        const config = GETSETTINGS();

        if (config.antidelete === "off") return;
        if (!message.key?.id) return;

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;

        let content = '';
        let mediaType = '';
        let mediaPath = '';

        const m = message.message;

        if (m?.conversation) {
            content = m.conversation;
        } else if (m?.extendedTextMessage?.text) {
            content = m.extendedTextMessage.text;
        }

        const mediaHandlers = [
            { type: 'imageMessage', ext: '.jpg', mimeFolder: 'image' },
            { type: 'videoMessage', ext: '.mp4', mimeFolder: 'video' },
            { type: 'audioMessage', ext: '.mp3', mimeFolder: 'audio' },
            {
                type: 'documentMessage',
                ext: () => {
                    const filename = m.documentMessage?.fileName || '';
                    const dotExt = path.extname(filename);
                    return dotExt || '.bin';
                },
                mimeFolder: 'document'
            },
            { type: 'stickerMessage', ext: '.webp', mimeFolder: 'sticker' }
        ];

        for (const handler of mediaHandlers) {
            if (m?.[handler.type]) {
                mediaType = handler.type.replace('Message', '');
                const ext = typeof handler.ext === 'function' ? handler.ext() : handler.ext;

                const stream = await downloadContentFromMessage(m[handler.type], handler.mimeFolder);
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);

                mediaPath = getMediaPath(messageId, ext);
                await writeFile(mediaPath, buffer);

                if (m[handler.type]?.caption && !content) {
                    content = m[handler.type].caption;
                }
                break;
            }
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString(),
            rawMessage: message // ajouté ici pour pouvoir reply au message supprimé
        });

        const canSave = !["newsletter", "broadcast"].includes(message.key.remoteJid)
        if (config.chatbot === "on" && m?.conversation && canSave) {
            addToGlobalHistory(message.key.remoteJid, isUser ? "bot" : "client", content)
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Prompt for chatbot
function getPrompt() {
    const promptFile = path.join(__dirname, './prompt.txt');
    const defaultPrompt = "You are a helpful assistant.";
    try {
        if (fs.existsSync(promptFile)) {
            return fs.readFileSync(promptFile, 'utf8');
        } else {
            return defaultPrompt;
        }
    } catch (err) {
        console.error("Erreur lecture du prompt :", err);
        return defaultPrompt;
    }
}

// When receive contact

async function handleContactDetected(Tayc, m, start, sendPrivate) {
    if (start !== "on") return;

    console.log(
        chalk.yellowBright("[CONTACT]"),
        chalk.blueBright("New contact(s) detected in"),
        chalk.greenBright(m.chat)
    );

    const CONTACTS = fs.existsSync(ALL_CONTACTS_PATH)
        ? JSON.parse(fs.readFileSync(ALL_CONTACTS_PATH, 'utf-8'))
        : [];

    const mess = GETPRIVACY()?.mess?.addNewContact || "*Hi 🖖. Save me as Warano*";

    const extractPhoneNumber = (vcard = "") => {
        const match = vcard.match(/TEL.*:(.+)/);
        return match ? match[1].replace(/\D/g, "") : null;
    };

    let rawContacts = [];

    if (m.mtype === "contactMessage" && m.msg.vcard) {
        rawContacts.push({
            vcard: m.msg.vcard,
            displayName: m.msg.displayName || "Unknown"
        });
    } else if (m.mtype === "contactsArrayMessage") {

        const arr = m.contacts || [];
        rawContacts.push(
            ...arr.map(c => ({
                vcard: c.vcard || "",
                displayName: c.displayName || "Unknown"
            }))
        );
    }

    if (rawContacts.length > 10) {
        sendPrivate("❌ Too many contacts detected. Please limit to 10 contacts at a time.");
        return;
    }

    console.log(chalk.cyan(`🔍 Found ${rawContacts.length} contact(s)`));

    let count = 0;
    const newlySent = [];

    for (const contact of rawContacts) {
        const number = extractPhoneNumber(contact.vcard);
        if (!number) continue;

        const jid = `${number}@s.whatsapp.net`;
        if (CONTACTS.includes(jid)) continue;

        try {
            await Tayc.sendMessage(jid, { text: mess });
            CONTACTS.push(jid);
            count++;
            newlySent.push({ name: contact.displayName, number, jid });
        } catch (err) {
            console.error(`❌ Failed to send to ${jid}:`, err.message);
        }
    }

    if (count > 0) {
        fs.writeFileSync(ALL_CONTACTS_PATH, JSON.stringify(CONTACTS, null, 2));
        sendPrivate(`✅ Successfully sent add message to *${count}* of *${rawContacts.length}* contact(s).\n
            *SEND BY:*  @${m.sender.split('@')[0]}\n
            `.trim(), [...newlySent.map(c => c.jid), m.sender]);

        console.table(newlySent);
    } else {
        sendPrivate("ℹ️ No new contact added or messages receive.");
    }
}

// antidelete message
async function handleMessageRevocation(sock, m, botNumber) {
    try {
        console.log(chalk.yellowBright("[ANTIDELETE]"), chalk.blueBright("Message revocation detected in"), chalk.greenBright(m.key.remoteJid));
        const config = GETSETTINGS();
        if (config.antidelete === "off") return;

        const messageId = m.message.protocolMessage.key.id;
        const deletedBy = m.participant || m.key.participant || m.key.remoteJid;
        const resendJid = config.antidelete === "private" ? botNumber : m.chat;
        console.log(resendJid, deletedBy);

        if (deletedBy.includes(botNumber)) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const groupName = original.group ? (await sock.groupMetadata(original.group)).subject : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Africa/Douala',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `🚨 *DELETE ${original.mediaType ? "MEDIA" : "MESSAGE"}* 🚨\n\n` +
            `*🗑️ Deleted By:* @${deletedBy.split('@')[0]}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Chat:* @${sender.split('@')[0]}\n` +
            `*🕒 Time:* ${time}\n`;

        if (groupName) text += `*👥 Group:* ${groupName}\n`;

        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                mentions: [sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(resendJid, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(resendJid, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(resendJid, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(resendJid, {
                            audio: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'document':
                        await sock.sendMessage(resendJid, {
                            document: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(resendJid, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }

            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('Media cleanup error:', err);
            }

            await sock.sendMessage(resendJid, {
                text,
                mentions: [deletedBy, sender]
            }, {
                quoted: original.rawMessage || m // ✅ reply au message original
            });

            return;
        }

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        await sock.sendMessage(resendJid, {
            text,
            mentions: [deletedBy, sender]
        }, {
            quoted: original.rawMessage || m
        });

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

// antiedite message

async function handleMessageEdit(sock, m, botNumber) {
    try {
        console.log(chalk.yellowBright("[ANTIEDIT]"), chalk.blueBright("Edit Message detected in"), chalk.greenBright(m.key.remoteJid));
        const config = GETSETTINGS();
        if (config.antiedite === "off") return;

        const protocol = m.message?.protocolMessage;

        const messageId = protocol.key.id;
        const editedMessage = protocol.editedMessage;
        const jid = config.antiedite === "private" ? botNumber : m.key.remoteJid;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const oldContent = original.content || 'N/A';
        const newContent = editedMessage?.conversation || 'N/A';

        if (oldContent === newContent) return;

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Africa/Douala',
            hour12: true,
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        const text = `*🚨 EDIT MESSAGE 🚨*\n` +
            `*👤 SENDER:* @${sender.split('@')[0]}\n` +
            `*🕒 TIME:* ${time}\n\n` +
            `*🔒 ORIGINAL:* ${oldContent}\n\n` +
            `*🆕 NEW:* ${newContent}`;



        await sock.sendMessage(jid, {
            text,
            mentions: [sender]
        }, {
            quoted: original.rawMessage
        });

    } catch (err) {
        console.error("handleMessageEdit error:", err);
    }
}

// Function to handle status updates
const viewedStatusCache = new Set();

async function handleStatusUpdate(sock, update) {
    try {
        const config = GETSETTINGS();
        const statusBlackList = GETPRIVACY().statusblacklist || [];
        if (!config.autoviewstatus) return;

        const msg = update?.messages?.[0];
        const key = msg?.key;
        const messageId = key?.id;

        if (!msg || !key || key.remoteJid !== 'status@broadcast' || key.fromMe) return;
        const sender = key.participant;
        if (!sender || statusBlackList.includes(sender) || viewedStatusCache.has(messageId)) return;
        viewedStatusCache.add(messageId);
        console.log(chalk.yellowBright("[STATUS]"), chalk.blueBright("Status update detected"));

        // === Mark as vie ===
        try {
            await sock.readMessages([key]);
        } catch (err) {
            if (err.message?.includes('rate-overlimit')) {
                console.log('⚠️ Rate limit hit. Retrying...');
                await new Promise(res => setTimeout(res, 2000));
                await sock.readMessages([key]);
            } else {
                console.error('❌ Error viewing status:', err.message);
                return;
            }
        }

        // === Auto react ===
        if (config.autoreactstatus) {
            const emojis = (config.statusemojis || "").split(",").map(e => e.trim()).filter(Boolean);
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];

            if (emoji) {
                try {
                    await sock.sendMessage(sender, {
                        react: { text: emoji, key },
                        statusJidList: [sender, sock.user.id]
                    });
                    console.log(`🎉 Reacted with ${emoji} to ${sender.split('@')[0]} story`);
                } catch (e) {
                    console.error("❌ Failed to react to status:", e.message);
                }
            }
        }

        const content = msg.message?.extendedTextMessage?.text;

        if (config.autoreplystatus && content) {
            // const replyText = await getSmartReply(content);
            const replyText = `🤖 Auto-reply:\nYour status says:\n> ${content}`;

            try {
                await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
            } catch (err) {
                console.error("❌ Failed to auto-reply:", err.message);
            }
        }

    } catch (error) {
        console.error('❌ Error in handleStatusUpdate:', error.message);
    }
}
// to execute command
function run(cmd, cwd = process.cwd()) {
    execSync(cmd, { stdio: 'inherit', cwd });
}

function loadCommandsGroupedByCategory() {
    const commandsDir = path.join(__dirname, './src/cmd')
    const categories = {}

    fs.readdirSync(commandsDir).forEach(file => {
        const category = path.basename(file, '.js')
        const commands = require(path.join(commandsDir, file))

        if (Array.isArray(commands)) {
            categories[category] = commands
        }
    })

    return categories
}

// handle cmd command
async function handleCommand({ Tayc, react, reply, text:Text, command }) {
    const CMDS = getCommands()
    const settings = GETSETTINGS()
    let prefix = settings.prefix
    const allCommands = loadCommandsGroupedByCategory()
    console.log(command);
    
    switch (command) {
        case "update":
            try {
                run("node Tayc.js")
            } catch (e) {
                console.error("Error  while trying to update or restart the bot... " + e)
                react("❌")
                reply("*Can't update now.*\> Please try it manually")
            }
            break;
        case "help":
            let helpText = `┌─[*Commands help center* ]─┐\n`

            for (const [category, commands] of Object.entries(allCommands)) {
                for (const cmd of commands) {
                    helpText += `│ *${prefix}${cmd[0]}* → ${cmd.length < 20 ? cmd.desc : cmd.desc.slice(0, 17) + "..."}\n`
                }
                helpText += `> *NB*: You can type ${prefix}help *<Command>* to get spécifique command help\n`
                helpText += `╰───────[TAKE ALL YOU CAN]────────\n\n`
            }

            if (!Text) return reply(helpText)
            const matched = CMDS.find(cmd =>
                Array.isArray(cmd.command) ? cmd.command.includes(Text) : cmd.command === Text
            );
            if (!matched) return reply(`❌*${Text}* command non found!. Contact Warano here @237621092130 to apply for implementation of it`, ["237621092130@s.whatsapp.net"])
            reply(`ℹ️ Here is *${Text}* usage details:\n- *COMMAND*:${Text}\n- *Equivalent(s)*:\n${matched.command.map(e => "> " + e).join("\n")}\n- *Description*:${matched?.desc||"No description for this command"}`)
            break;

        default:
            reply("Menu loading...")
            const start = performance.now()
            const version = require("./package.json").version
            const host = 'Panel'

            moment.locale('fr') // langue française
            const date = moment().tz('Africa/Douala').format('dddd D MMMM YYYY')
            const time = moment().tz('Africa/Douala').format('HH:mm:ss')
            const botName = global.botName || "Tayc"
            const totalMem = os.totalmem() / 1024 / 1024 / 1024 // en Go
            const usedMem = process.memoryUsage().heapUsed / 1024 / 1024 // en Mo
            const end = performance.now()
            const speed = (end - start).toFixed(2)
            let text = `
┌──────◇ ${botName} ◇┐
│ *OWNER*   : *${Tayc.user.name}*
│ *PREFIX*  : *[ ${settings.prefix} ]*
│ *DATE*    : *${date}*
│ *TIME*    : *${time}*
│ *HOST*    : *${host}*
│ *MODE*    : *${settings.mode}*
│ *VERSION* : *${version}*
│ *SPEED*   : *${speed} ms*
│ *PLUGINS* : *${CMDS.length}*
│ *USAGE*   : *${usedMem.toFixed(1)} MB of ${totalMem.toFixed(0)} GB*
└────────────────────────
\n\n`.trim()
            text += "\n\n"
            for (const [category, commands] of Object.entries(allCommands)) {
                text += `╭───❍ *${category.toUpperCase()} COMMANDS*\n`
                for (const cmd of commands) {
                    text += `│ • ${cmd.command[0]} \n`
                }
                text += `╰──────────────\n\n`
            }
            text += `> © ${new Date().getFullYear()} Tayc Bot BY *Warano*. All rights reserved.`
            await reply(text)
            break;
    }
}


// Scheduled message
async function ScheduledMessages(Tayc) {
    try {
        const settings = LOADSETTINGS();
        let tab = settings.scheduled || [];
        const ids = [];
        if (!tab.length) return;
        const now = new Date();
        const messages = tab.filter(e => new Date(e.sendAt) <= now);
        if (!messages.length) return;
        console.log(chalk.yellowBright("[SCHEDULED]"), chalk.blueBright("Scheduled messages detected"));
        for (const message of messages) {
            const { to, id, text } = message;
            try {
                await Tayc.sendMessage(to, { text });
                await sleep(3000);
                ids.push(id);
            } catch (err) {
                console.error(chalk.redBright("[SCHEDULED]"), chalk.yellowBright("Error sending scheduled message:"), err);
            }
        }
        tab = tab.filter(m => new Date(m.sendAt) > now);
        saveNewSetting({ ...settings, scheduled: tab });
        try {
            const response = `✅ Successfully sent ${messages.length} scheduled message(s).`;
            await Tayc.sendMessage(Tayc.user.id, { text: response });
        } catch (err) {
            console.error("❌ Failed to send confirmation to bot owner:", err.message);
        }
    } catch (e) {
        console.log(chalk.redBright("[SCHEDULED]"), chalk.yellowBright("Error in ScheduledMessages:"), e);
    }
}



// Instead, export the handlers along with handleMessages
module.exports = {
    getPrompt,
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatusUpdate,
    ScheduledMessages,
    saveNewSetting
};
