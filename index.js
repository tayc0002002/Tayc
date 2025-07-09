const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const axios = require('axios')
const FileType = require('file-type')
const readline = require('readline')
const PhoneNumber = require('awesome-phonenumber')
const NodeCache = require("node-cache")
const pino = require("pino")
const { parsePhoneNumber } = require("libphonenumber-js")
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    jidDecode,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")

const { handleMessages, handleGroupParticipantUpdate, getPrompt, handleStatusUpdate } = require('./main')
const { smsg } = require('./lib/myfunc')
const { loadCommands, watchCommands } = require('./src/lib/loader')

const settings = require('./settings')
const { startAutoClear } = require('./lib/myfunc2')

let phoneNumber = "255763834140"


const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

const store = {
    messages: {},
    contacts: {},
    chats: {},
    groupMetadata: async (jid) => ({}),
    bind: function (ev) {
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (msg.key && msg.key.remoteJid) {
                    this.messages[msg.key.remoteJid] = this.messages[msg.key.remoteJid] || {}
                    this.messages[msg.key.remoteJid][msg.key.id] = msg
                }
            })
        })
        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = contact
                }
            })
        })
        ev.on('chats.set', (chats) => {
            this.chats = chats
        })
    },
    loadMessage: async (jid, id) => {
        return this.messages[jid]?.[id] || null
    }
}

async function startTaycInc() {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache()

    const TaycInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            const jid = jidNormalizedUser(key.remoteJid)
            const msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache
    })

    store.bind(TaycInc.ev)

    TaycInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        if (qr) {
            console.log(chalk.bgGreen.whiteBright(`Your QR Code: ${qr}`))
        }
        if (connection === 'open') {
            const botNumber = TaycInc.user.id.split(':')[0] + '@s.whatsapp.net'
            await TaycInc.sendMessage(botNumber, {
                text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`
            })
            await delay(1000)
            console.log(chalk.green("Connected✅"))
        }
        if (connection === "close" && lastDisconnect && lastDisconnect.error?.output?.statusCode !== 401) {
            console.log(chalk.red("Reconnexion..."))
            setTimeout(startTaycInc, 5000)
        }
    })

    TaycInc.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatusUpdate(TaycInc, chatUpdate)
                return
            }
            // if (!TaycInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            await handleMessages(TaycInc, chatUpdate, true)
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    TaycInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(TaycInc, update)
    })

    TaycInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            const decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        }
        return jid
    }

    TaycInc.getName = (jid, withoutContact = false) => {
        const id = TaycInc.decodeJid(jid)
        withoutContact = TaycInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) {
            return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = await TaycInc.groupMetadata(id) || {}
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
        } else {
            v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } :
                id === TaycInc.decodeJid(TaycInc.user.id) ? TaycInc.user :
                    (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }
    }

    TaycInc.serializeM = (m) => smsg(TaycInc, m, store)

    TaycInc.public = true

    TaycInc.ev.on('creds.update', saveCreds)
}

loadCommands()
watchCommands()
startAutoClear()

startTaycInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})
