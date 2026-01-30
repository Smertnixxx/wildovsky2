const { addWelcome, delWelcome, isWelcomeOn, getWelcome } = require('../lib/index');

let welcomeQueue = {};

async function handleWelcome(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `📥 *Welcome Message Setup*\n\n✅ *.welcome on* — Enable welcome messages\n🛠️ *.welcome set Your custom message* — Set a custom welcome message\n🚫 *.welcome off* — Disable welcome messages\n\n*Available Variables:*\n• @user - Mentions the new member\n• @group - Shows group name\n• @desc - Shows group description\n• @count - Shows total members`,
            quoted: message
        });
    }

    const lowerMatch = match.toLowerCase();

    if (lowerMatch === 'on') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, { text: '⚠️ Welcome messages are *already enabled*.', quoted: message });
        }
        const defaultWelcome = `*✨ Добро пожаловать @user в группу @group*\n📃 Ознакомьтесь с правилами группы\n${String.fromCharCode(8206).repeat(850)}\n@desc`;
        await addWelcome(chatId, true, defaultWelcome);
        return sock.sendMessage(chatId, { text: '✅ Приветствие установлено\nТак же вы можете установить свой текст для приветствия новых участников группы\nДля этого введите *.welcome set (ваш текст)*', quoted: message });
    }

    if (lowerMatch === 'off') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, { text: '⚠️ Welcome messages are *already disabled*.', quoted: message });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, { text: '✅ Welcome messages *disabled* for this group.', quoted: message });
    }

    if (lowerMatch.startsWith('set ')) {
        const customMessage = match.substring(4).trim();
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: '⚠️ Введите текст приветствия\n📌 Пример: *.welcome set Добро пожаловать @user в @group!*', quoted: message });
        }
        await addWelcome(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: '✅ Текст приветствия установлен', quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: `❌ Invalid command. Use:\n*.welcome on* - Enable\n*.welcome set [message]* - Set custom message\n*.welcome off* - Disable`,
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
            console.error('Error sending welcome message:', error);
        }
    }, 5000);
}

async function welcomeCommand(sock, chatId, message, match) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'This command can only be used in groups.' });
        return;
    }

    const text = message.message?.conversation || 
                message.message?.extendedTextMessage?.text || '';
    const matchText = text.split(' ').slice(1).join(' ');

    await handleWelcome(sock, chatId, message, matchText);
}

module.exports = { welcomeCommand, handleJoinEvent, handleWelcome };