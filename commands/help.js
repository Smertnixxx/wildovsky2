const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const senderId = (message && message.key && (message.key.participant || message.key.remoteJid)) || '';
    const senderShort = senderId ? senderId.split('@')[0] : 'user';

    const helpMessage = `
привет @${senderShort} как дела?

Доступные команды:

> .hidetag
> .antilink
> .пинг
> .повысить
> .понизить
> .разработчик
> .стикер
> .ttt
> .инфогруппа
> .кик
> +чат
> -чат
и все больше пока ничо нет

`;

    try {

        await sock.sendMessage(chatId, {
            text: helpMessage,
            mentions: senderId ? [senderId] : [],
        }, { quoted: message });
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, {
            text: helpMessage,
            mentions: senderId ? [senderId] : [],
        });
    }
}

module.exports = helpCommand;