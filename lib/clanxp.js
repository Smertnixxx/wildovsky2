function track(senderId) {
    try {
        const { addMsg } = require('../commands/clancommands');
        addMsg(senderId);
    } catch (e) {
        console.error('clanxp track error:', e.message);
    }
}

module.exports = { track };