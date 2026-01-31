const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const senderId = (message && message.key && (message.key.participant || message.key.remoteJid)) || '';
    const senderShort = senderId ? senderId.split('@')[0] : 'user';

    const helpMessage = `
привет @${senderShort} как дела?

Доступные команды:

👥 Для группы
> .все
> .antilink
> .мут @пользователь (причина) (срок)
> .размут @пользователь
> .муты 
> .инфогруппа
> .кик
> .повысить
> .понизить

> .разработчик
> .пинг
> .стикер
> .ttt
> .инфогруппа
> .кик


*Аниме команды*
> .обнять
> .поцеловать
> .убить
> .кринж
> .укусить
> .ударить
> .облизнуть

Если еще нужны будут команды обращайтесь wa.me/79292991077
предлагайте идеи что можно добавить

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