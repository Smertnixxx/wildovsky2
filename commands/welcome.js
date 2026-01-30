const { isWelcomeOn, getWelcome } = require('../lib/index');

let welcomeQueue = {};

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
        let welcomeText = customMessage || 'Добро пожаловать @user!';
        
        let userMentions = users.map(user => `@${user.split('@')[0]}`).join(' ');
        
        if (welcomeText.includes('{user}')) {
            welcomeText = welcomeText.replace(/{user}/g, userMentions);
        } else if (welcomeText.includes('@user')) {
            welcomeText = welcomeText.replace(/@user/g, userMentions);
        } else {
            welcomeText = `${welcomeText} ${userMentions}`;
        }

        let finalMessage = welcomeText
            .replace(/{group}/g, groupName)
            .replace(/@group/g, groupName)
            .replace(/@subject/g, groupName)
            .replace(/{description}/g, groupDesc)
            .replace(/@desc/g, groupDesc)
            .replace(/{count}/g, `${totalMembers}`)
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

module.exports = { handleJoinEvent };