// commands/help.js
const getDisplayName = require('../lib/getDisplayName');

async function helpCommand(sock, chatId, message) {

    const senderId = (message && message.key && (message.key.participant || message.key.remoteJid)) || '';
    const name = await getDisplayName(sock, senderId);

    const helpMessage = `
привет ${name}, как дела?

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

⚙️ Разное
> .разработчик
> .пинг
> .ttt
> .инфогруппа
> .кик

🔃 Преобразование
> .стикер
> .ptv
> .tts 

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
            text: helpMessage
        }, { quoted: message });
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;