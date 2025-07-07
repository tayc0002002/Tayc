const chalk = require('chalk');
const PhoneNumber = require('awesome-phonenumber');

function logMessage(sock, msg) {
    if (!msg || !msg.message) return;

    const messageType = Object.keys(msg.message)[0] || 'unknown';
    let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[No text]';

    const remoteJid = msg.key?.remoteJid || 'unknown';
    const fromGroup = remoteJid.endsWith('@g.us');
    const senderJid = fromGroup ? msg.key?.participant : remoteJid;
    const chatId = remoteJid;
    const name = msg.pushName || 'UNKNOWN';

    // Safe parsing du numéro
    let number = senderJid;
    try {
        const parsed = PhoneNumber('+' + (senderJid || '').replace(/\D/g, ''));
        number = parsed.getNumber('international') || senderJid;
    } catch {
        number = senderJid || '[Unknown sender]';
    }

    const timestamp = new Date(Number(msg.messageTimestamp || Date.now()) * 1000);

    const botName = 'TAYC MD';
    const fullLineLength = 50;
    const decoratedName = `『 ${botName} 』`;
    const remaining = fullLineLength - decoratedName.length;
    const side = "\t\t†" + '━'.repeat(Math.floor(remaining / 2));
    const header = chalk.hex('#FFAA00')(side + decoratedName + side.replace("†", "").replace("\t\t", "").concat("╮"));

    const label = (txt) => chalk.green.bold(`\t\t» ${txt.padEnd(14)}: `);
    const footer = chalk.hex('#FF00FF')('\t\t╰' + '━'.repeat(fullLineLength) + '╯');

    const fields = [
        `${label('Sent Time')}${chalk.white(timestamp.toLocaleString('en-GB', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }))} EAT`,
        `${label('Message Type')}${chalk.hex('#FF6600')(messageType)}`,
        `${label('Sender')}${chalk.yellow(number)}`,
        `${label('Name')}${chalk.redBright(name)}`,
        `${label('Chat ID')}${chalk.cyan(chatId)}`,
        `${label('Message')}${chalk.reset(text)}`
    ];

    console.log(['\n' + header, ...fields, footer].join('\n'));
}


module.exports = logMessage;
