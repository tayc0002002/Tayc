/**
 * TAYC - A WhatsApp Bot
 * Copyright (c) 2025 Warano
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by DJC 
 */
const {
    proto,
    delay,
    getContentType,
    downloadMediaMessage
} = require('@whiskeysockets/baileys')
const chalk = require('chalk')
const fs = require('fs')
const Crypto = require('crypto')
const axios = require('axios')
const moment = require('moment-timezone')
const {
    sizeFormatter
} = require('human-readable')
const util = require('util')
const Jimp = require('jimp')
const {
    defaultMaxListeners
} = require('stream')
const path = require('path')
const { tmpdir } = require('os')
const vCard = require('vcf');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const flags = require('emoji-flags');
const unixTimestampSeconds = (date = new Date()) => Math.floor(date.getTime() / 1000)

exports.unixTimestampSeconds = unixTimestampSeconds

exports.generateMessageTag = (epoch) => {
    let tag = (0, exports.unixTimestampSeconds)().toString();
    if (epoch)
        tag += '.--' + epoch; // attach epoch if provided
    return tag;
}

exports.processTime = (timestamp, now) => {
    return moment.duration(now - moment(timestamp * 1000)).asSeconds()
}

exports.getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}${ext}`
}

exports.getBuffer = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: "get",
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer'
        })
        return res.data
    } catch (err) {
        return err
    }
}

exports.getImg = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: "get",
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer'
        })
        return res.data
    } catch (err) {
        return err
    }
}

exports.fetchJson = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        })
        return res.data
    } catch (err) {
        return err
    }
}

exports.runtime = function (seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor(seconds % (3600 * 24) / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 60);
    var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

exports.clockString = (ms) => {
    let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
    let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
    let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}

exports.sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'))
}

exports.getTime = (format, date) => {
    if (date) {
        return moment(date).locale('id').format(format)
    } else {
        return moment.tz('Asia/Jakarta').locale('id').format(format)
    }
}

exports.formatDate = (n, locale = 'id') => {
    let d = new Date(n)
    return d.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    })
}

exports.tanggal = (numer) => {
    const myMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const myDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
    const tgl = new Date(numer);
    const day = tgl.getDate();
    const bulan = tgl.getMonth();
    let thisDay = tgl.getDay();
    thisDay = myDays[thisDay];
    const yy = tgl.getYear();
    const year = (yy < 1000) ? yy + 1900 : yy;
    const time = moment.tz('Asia/Jakarta').format('DD/MM HH:mm:ss');
    const d = new Date();
    const locale = 'id';
    const gmt = new Date(0).getTime() - new Date('1 January 1970').getTime();
    const weton = ['Pahing', 'Pon', 'Wage', 'Kliwon', 'Legi'][Math.floor(((d * 1) + gmt) / 84600000) % 5];

    return `${thisDay}, ${day} - ${myMonths[bulan]} - ${year}`;
}

exports.jam = (numer, options = {}) => {
    let format = options.format ? options.format : "HH:mm"
    let jam = options?.timeZone ? moment(numer).tz(timeZone).format(format) : moment(numer).format(format)

    return `${jam}`
}

exports.formatp = sizeFormatter({
    std: 'JEDEC', //'SI' = default | 'IEC' | 'JEDEC'
    decimalPlaces: 2,
    keepTrailingZeroes: false,
    render: (literal, symbol) => `${literal} ${symbol}B`,
})

exports.json = (string) => {
    return JSON.stringify(string, null, 2)
}

function format(...args) {
    return util.format(...args)
}

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length')
    for (let i in inp)
        if (util.isDeepStrictEqual(check, inp[i])) return out[i]
    return null
}

exports.generateProfilePicture = async (buffer) => {
    const jimp = await Jimp.read(buffer)
    const min = jimp.getWidth()
    const max = jimp.getHeight()
    const cropped = jimp.crop(0, 0, min, max)
    return {
        img: await cropped.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG),
        preview: await cropped.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG)
    }
}

exports.bytesToSize = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

exports.getSizeMedia = (path) => {
    return new Promise((resolve, reject) => {
        if (/http/.test(path)) {
            axios.get(path)
                .then((res) => {
                    let length = parseInt(res.headers['content-length'])
                    let size = exports.bytesToSize(length, 3)
                    if (!isNaN(length)) resolve(size)
                })
        } else if (Buffer.isBuffer(path)) {
            let length = Buffer.byteLength(path)
            let size = exports.bytesToSize(length, 3)
            if (!isNaN(length)) resolve(size)
        } else {
            reject('error gatau apah')
        }
    })
}

exports.parseMention = (text = '') => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
}

exports.getGroupAdmins = (participants) => {
    let admins = []
    for (let i of participants) {
        i.admin === "superadmin" ? admins.push(i.id) : i.admin === "admin" ? admins.push(i.id) : ''
    }
    return admins || []
}


/**
 * Parse un fichier .vcf et ajoute nom, numéro, pays, flag
 * @param {Buffer|string} vcfData 
 * @returns {Array<{ name: string, number: string, country: string, countryCode: string, flag: string }>}
 */
function parseVcard(vcfData) {
    const text = Buffer.isBuffer(vcfData) ? vcfData.toString() : vcfData;
    const cards = vCard.parse(text);
    const results = [];

    for (const card of cards) {
        const name = card.get('fn')?.valueOf() || 'Unknown';
        const tels = card.get('tel');
        const telList = Array.isArray(tels) ? tels : tels ? [tels] : [];

        for (const tel of telList) {
            const raw = tel.valueOf();
            const phone = parsePhoneNumberFromString(raw);
            const country = phone?.country || 'Unknown';
            const code = phone?.countryCallingCode ? `+${phone.countryCallingCode}` : 'Unknown';
            const flag = flags.countryCode(country)?.emoji || '';

            results.push({ name, number: raw, country, countryCode: code, flag });
        }
    }

    return results;
}

exports.parseVcard = parseVcard;


/**
 * Serialize Message
 * @param {WAConnection} TaycInc 
 * @param {Object} m 
 * @param {store} store 
 */
exports.smsg = async (TaycInc, m, store) => {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = TaycInc.decodeJid(m.fromMe ? TaycInc.user.id : m.participant || m.key.participant || m.chat)
        if (m.isGroup) m.participant = TaycInc.decodeJid(m.key.participant) || ''
    }

    if (m.message) {
        m.mtype = getContentType(m.message)
        const content = m.message?.[m.mtype]

        if (m.mtype === 'viewOnceMessage') {
            const inner = content?.message
            const innerType = inner && Object.keys(inner)[0]
            m.msg = inner?.[innerType] || {}
        } else if (m.mtype === 'contactMessage') {
            m.msg = content || {}
        } else if (m.mtype === 'contactsArrayMessage') {
            m.contacts = content?.contacts || []
            m.msg = m.contacts[0] || {}
        } else {
            m.msg = content || {}
        }

        m.body =
            m.message.conversation ||
            m.msg.caption ||
            m.msg.text ||
            (m.mtype === 'listResponseMessage' && m.msg.singleSelectReply?.selectedRowId) ||
            (['contactMessage', 'contactsArrayMessage'].includes(m.mtype) && 'contact message') ||
            (m.mtype === 'buttonsResponseMessage' && m.msg.selectedButtonId) ||
            (m.mtype === 'viewOnceMessage' && m.msg.caption) ||
            (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(m.mtype) && 'media message') ||
            (m.mtype === 'protocolMessage' && 'N/A') ||
            'N/A'

        // Gestion du message cité
        let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null
        m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []

        if (quoted) {
            let type = getContentType(quoted)
            let quotedMsg = quoted[type]

            if (['productMessage'].includes(type)) {
                type = getContentType(quotedMsg)
                quotedMsg = quotedMsg[type]
            }

            if (typeof quotedMsg === 'string') quotedMsg = { text: quotedMsg }

            m.quoted = quotedMsg
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
            m.quoted.isBaileys = m.quoted.id?.startsWith('BAE5') && m.quoted.id.length === 16
            m.quoted.sender = TaycInc.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === TaycInc.user?.id
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
            m.quoted.mentionedJid = m.msg.contextInfo.mentionedJid || []

            // Ajout VCF parser
            const quotedMessageFull = {
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            }

            const vM = proto.WebMessageInfo.fromObject(quotedMessageFull)

            m.quoted.fakeObj = vM
            m.quoted.delete = () => TaycInc.sendMessage(m.quoted.chat, { delete: vM.key })
            m.quoted.copyNForward = (jid, forceForward = false, options = {}) => TaycInc.copyNForward(jid, vM, forceForward, options)
            m.quoted.download = () => TaycInc.downloadMediaMessage(m.quoted)

            // Si VCF
            const isVcf = quoted?.documentMessage?.mimetype === 'text/x-vcard'
            if (isVcf) {
                try {
                    console.log("Downloading...");
                    
                    const buffer = await downloadMediaMessage(vM, 'buffer', {}, {
                        reuploadRequest: TaycInc.updateMediaMessage
                    })
                    
                    const content = buffer.toString()                    
                    m.quoted.vcf = parseVcard(content)
                    console.log(m.quoted.vcf);
                    
                } catch (e) {
                    console.error('❌ Failed to parse quoted VCF file:', e.message)
                    m.quoted.vcf = null
                }
            }

            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                const q = await store.loadMessage(m.chat, m.quoted.id, TaycInc)
                return exports.smsg(TaycInc, q, store)
            }
        }
    }

    if (m.msg?.url) m.download = () => TaycInc.downloadMediaMessage(m.msg)
    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''

    m.reply = (text, chatId = m.chat, options = {}) =>
        Buffer.isBuffer(text)
            ? TaycInc.sendMedia(chatId, text, 'file', '', m, options)
            : TaycInc.sendText(chatId, text, m, options)

    m.copy = () => exports.smsg(TaycInc, M.fromObject(M.toObject(m)))
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) =>
        TaycInc.copyNForward(jid, m, forceForward, options)

    return m
}

exports.reSize = (buffer, ukur1, ukur2) => {
    return new Promise(async (resolve, reject) => {
        var baper = await Jimp.read(buffer);
        var ab = await baper.resize(ukur1, ukur2).getBufferAsync(Jimp.MIME_JPEG)
        resolve(ab)
    })
}

exports.GETSETTINGS = () => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/db/settings.json'), 'utf-8'))
        return data.settings
    } catch {
        return {}
    }
}

exports.LOADSETTINGS = () => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/db/settings.json'), 'utf-8'))
        return data
    } catch {
        return {}
    }
}

exports.GETPRIVACY = () => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/db/settings.json'), 'utf-8'))
        const { settings, ...value } = data
        return value
    } catch {
        return {}
    }
}

exports.getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }
        return totalSize / (1024 * 1024);
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};
exports.isAdmin = async (TaycInc, chatId, senderId) => {
    try {
        const groupMetadata = await TaycInc.groupMetadata(chatId);

        const botId = TaycInc.user.id.split(':')[0] + '@s.whatsapp.net';

        const participant = groupMetadata.participants.find(p =>
            p.id === senderId ||
            p.id === senderId.replace('@s.whatsapp.net', '@lid') ||
            p.id === senderId.replace('@lid', '@s.whatsapp.net')
        );

        const bot = groupMetadata.participants.find(p =>
            p.id === botId ||
            p.id === botId.replace('@s.whatsapp.net', '@lid')
        );

        const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
        const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

        if (!bot) {
            return { isSenderAdmin, isBotAdmin: true };
        }

        return { isSenderAdmin, isBotAdmin };
    } catch (error) {
        console.error('Error in isAdmin:', error);
        return { isSenderAdmin: false, isBotAdmin: false };
    }
}
