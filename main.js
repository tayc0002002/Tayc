require('./config.js');
const { fetchBuffer, GETSETTINGS, isAdmin, smsg } = require('./lib/myfunc');
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

const messageStore = new Map();
const ALL_CHAT_PATH = path.join(__dirname, './src/db/chats.json');
// Add this near the top of main.js with other global configurations
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363398106360290@newsletter',
            newsletterName: 'BWB XMD',
            serverMessageId: -1
        }
    }
};

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
        // Loading settings...
        const settings = GETSETTINGS();
        const COMMANDS = getCommands()
        const prefix = settings.prefix
        const sudoList = settings.sudo || [];

        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        // Extract message and sender infos
        const message = messages[0];
        const key = message.key
        const from = message.key.remoteJid;
        const botNumber = Tayc.user.id
        const fromGroup = from.endsWith('@g.us');
        const senderJid = fromGroup ? message.key.participant : from;
        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        let isBotAdmin = sudoList.includes(senderJid) || senderJid === botNumber;

        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!message?.message || (from.endsWith("@newsletter"))) return;
        const m = smsg(Tayc, messages[0]);
        // Utils fonctions
        const reply = (text) => Tayc.sendMessage(chatId, { text }, { quoted: message });
        const sendText = async (text) => await Tayc.sendMessage(chatId, { text });
        const react = async (text) => await Tayc.sendMessage(from, {
            react: {
                text, key
            }
        });

        // console.log(senderJid, COMMANDS);

        const userMessage = (
            message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            ''
        ).toLowerCase().replace(/\.\\s+/g, '.').trim();
        // Preserve raw message for commands like .tag that need original casing
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        logMessage(Tayc, message);

        if (message.message) {
            await storeMessage(message, Tayc.user.id === Tayc.user.id);
        }

        // Handle message revocation
        if (message.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(Tayc, message);
            return;
        }


        // Check for bad words FIRST, before ANY other processing
        if (isGroup && userMessage) {
            await handleBadwordDetection(Tayc, chatId, message, userMessage, senderJid);
            await Antilink(message, Tayc);
        }

        // Then check for command prefix
        if (!userMessage.startsWith(prefix) && settings.chatbot === "on") {
            await handleChatbotResponse(Tayc, chatId, message, userMessage, senderJid);
            return;
        }

        const context = {
            sendText,
            isGroup: fromGroup,
            botNumber,
            prefix,
            reply,
            react,
            key,
            quotedMessage,
            isBotAdmin,
            jid: message.key.remoteJid,
            isBotUser: Tayc.user.id === Tayc.user.id,
            botMode: settings.mode
        }

        if (m.body.startsWith(prefix)) {
            const body = m.body.slice(prefix.length).trim();
            const commandName = body.split(' ')[0].toLowerCase();
            const args = body.split(' ').slice(1);

            const matched = COMMANDS.find(cmd =>
                Array.isArray(cmd.command) ? cmd.command.includes(commandName) : cmd.command === commandName
            );

            if (matched && typeof matched.operate === 'function') {
                try {
                    await matched.operate({
                        Tayc,
                        ...context,
                        args,
                        ...global,
                        full: body,
                        command: commandName,
                        message: m,
                        sender: senderJid,
                        from: chatId
                    });
                } catch (err) {
                    console.error(`❌ Error in command "${matched.command}":`, err);
                    await reply("❌ Une erreur est survenue lors de l'exécution de la commande.");
                }
            }
        }

    } catch (error) {
        console.error('❌ Error in message handler:', error.message);
        await Tayc.sendMessage(Tayc.user.id, {
            text: '❌ Failed to handle message❌\n\n' + error,
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

// Instead, export the handlers along with handleMessages
module.exports = {
    getPrompt,
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (Tayc, status) => {
        await handleStatusUpdate(Tayc, status);
    }
};
