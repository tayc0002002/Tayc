require('./config.js');
const { fetchBuffer, GETSETTINGS, isAdmin, smsg, GETPRIVACY, LOADSETTINGS } = require('./lib/myfunc');
const fs = require('fs');

const path = require('path');

const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('./lib/index');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Antilink } = require('./lib/antilink');
const { handleDemotionEvent } = require('./commands/demote');


const TEMP_MEDIA_DIR = path.join(__dirname, './tmp');
const { writeFile } = require('fs/promises');
const logMessage = require('./src/lib/statique.js');
const { getCommands } = require('./src/lib/loader.js');
const chalk = require('chalk');
const { handleStatusUpdate } = require('./commands/autostatus.js');
const { handleChatbotResponse } = require('./commands/chatbot.js');
const { handleBadwordDetection } = require('./lib/antibadword.js');
const { handleMessageRevocation } = require('./commands/antidelete.js');

const messageStore = new Map();
const ALL_CHAT_PATH = path.join(__dirname, './src/db/chats.json');


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
        if (!message.message || message.key?.remoteJid?.endsWith("@newsletter")) return;

        const m = smsg(Tayc, message);
        //  console.log(m);

        if (!m || !m.body) return;

        const chatId = m.chat;
        const senderJid = m.sender;
        const fromGroup = m.isGroup;
        const botNumber = Tayc.user.id;
        const isBotAdmin = m.fromMe || sudoList.includes(senderJid);

        // === UTILITIES ===
        const reply = (text) => Tayc.sendMessage(chatId, { text }, { quoted: m });
        const sendText = async (text) => await Tayc.sendMessage(chatId, { text });
        const sendPrivate = async (text, mentions = []) => await Tayc.sendMessage(botNumber, { text }, { mentions })

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
        if (m.msg?.protocolMessage?.type === 0) {
            await handleMessageRevocation(Tayc, m);
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
            quoted: m.quoted?.msg, // quoted msg (if any)
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
            quotedMessage: m.quoted?.msg || null,
            command: '',
            args: [],
            text: "",
            Settings: LOADSETTINGS(),
            full: '',
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

            const matched = COMMANDS.find(cmd =>
                Array.isArray(cmd.command) ? cmd.command.includes(commandName) : cmd.command === commandName
            );

            if (!matched) return

            if (taycMode === "private" && !context.isOwner && !context.isBotUser) {
                react("❌")
                await reply("*Take Your own access to Take All You Can*")
                return
            }

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

    const contactsPath = path.join(__dirname, "./src/db/contacts.json");
    const CONTACTS = fs.existsSync(contactsPath)
        ? JSON.parse(fs.readFileSync(contactsPath, 'utf-8'))
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
        fs.writeFileSync(contactsPath, JSON.stringify(CONTACTS, null, 2));
        sendPrivate(`✅ Successfully sent add message to *${count}* of *${rawContacts.length}* contact(s).\n
            *SEND BY:*  @${m.sender.split('@')[0]}\n
            `.trim(), [...newlySent.map(c => c.jid), m.sender]);

        console.table(newlySent);
    } else {
        sendPrivate("ℹ️ No new contact added or messages sent.");
    }
}

// Instead, export the handlers along with handleMessages
module.exports = {
    getPrompt,
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (Tayc, status) => {
        await handleStatusUpdate(Tayc, status);
    }
};
