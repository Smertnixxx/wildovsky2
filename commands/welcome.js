const { addWelcome, delWelcome, isWelcomeOn, getWelcome } = require('../lib/index');

let welcomeQueue = {};

async function handleWelcome(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `⚙️ *Настройка приветствия*\n\n> .приветствие вкл\n> .приветствие установить (ваше сообщение)\n> .приветствие выкл\n\n*Для своих приветствий вы можете вставить в текст это:*\n• @user - Отметит пользователя\n• @group - Покажет название вашей группы\n• @desc - Вставит описание вашей группы\n• @count - Отобразит количество участников вашей группы`,
            quoted: message
        });
    }

    const lowerMatch = match.toLowerCase();

    if (lowerMatch === 'вкл') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, { text: 'Приветствия в группе итак включены.', quoted: message });
        }
        const defaultWelcome = `*✨ Добро пожаловать @user в группу @group*\n📃 Ознакомьтесь с правилами группы\n${String.fromCharCode(8206).repeat(850)}\n@desc`;
        await addWelcome(chatId, true, defaultWelcome);
        return sock.sendMessage(chatId, { text: '✅ Приветствие установлено\nТак же вы можете установить свой текст для приветствия новых участников группы\nДля этого введите *.welcome set (ваш текст)*', quoted: message });
    }

    if (lowerMatch === 'выкл') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, { text: 'Приветствия в чате итак отключено', quoted: message });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, { text: '✅ Приветствие было отключено.', quoted: message });
    }

    if (lowerMatch.startsWith('установить ')) {
        const customMessage = match.substring(4).trim();
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: '⚠️ Введите текст приветствия\n📌 Пример: *.welcome set Добро пожаловать @user в @group!*', quoted: message });
        }
        await addWelcome(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: '✅ Текст приветствия установлен', quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: `❌ Вы не правильно набрали команду\nвот команды которые имеются:\n\n.приветствие вкл\n.приветствие выкл\n.приветствие установить (ваш текст)`,
        quoted: message
    });
}

async function handleJoinEvent(sock, id, participants) {
    const isWelcomeEnabled = await isWelcomeOn(id);
    if (!isWelcomeEnabled) return;

    const groupMetadata = await sock.groupMetadata(id);
    const groupName = groupMetadata.subject;
    const groupDesc = groupMetadata.desc || 'Описание группы отсутствует';
    const totalMembers = groupMetadata.participants.length;

    if (!welcomeQueue[id]) {
        welcomeQueue[id] = { users: [], timeout: null };
    }

    for (let participant of participants) {
        const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
        welcomeQueue[id].users.push(participantString);
    }

    if (welcomeQueue[id].timeout) return;

    welcomeQueue[id].timeout = setTimeout(async () => {
        let users = welcomeQueue[id].users;
        welcomeQueue[id].timeout = null;
        welcomeQueue[id].users = [];

        if (users.length === 0) return;

        const customMessage = await getWelcome(id);
        const defaultWelcome = `*✨ Добро пожаловать @user в группу @group*\n📃 Ознакомьтесь с правилами группы\n${String.fromCharCode(8206).repeat(850)}\n@desc`;
        let welcomeText = customMessage || defaultWelcome;
        
        let userMentions = users.map(user => `@${user.split('@')[0]}`).join(' ');
        
        if (welcomeText.includes('@user')) {
            welcomeText = welcomeText.replace(/@user/g, userMentions);
        } else {
            welcomeText = `${welcomeText} ${userMentions}`;
        }

        let finalMessage = welcomeText
            .replace(/@group/g, groupName)
            .replace(/@subject/g, groupName)
            .replace(/@desc/g, groupDesc)
            .replace(/@count/g, `${totalMembers}`);

        try {
            await sock.sendMessage(id, {
                text: finalMessage,
                mentions: users
            });
        } catch (error) {
            console.error('Ошибка:', error);
        }
    }, 5000);
}

async function welcomeCommand(sock, chatId, message, match) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Эта команда доступна только в группах.' });
        return;
    }

    const text = message.message?.conversation || 
                message.message?.extendedTextMessage?.text || '';
    const matchText = text.split(' ').slice(1).join(' ');

    await handleWelcome(sock, chatId, message, matchText);
}

module.exports = { welcomeCommand, handleJoinEvent, handleWelcome };