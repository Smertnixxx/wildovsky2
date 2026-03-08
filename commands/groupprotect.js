const PROTECTED_GROUP = '120363420486491862@g.us';

async function handle(sock, groupId, participants, author) {
    if (groupId !== PROTECTED_GROUP) return;
    if (!author) return;

    try {
        const meta = await sock.groupMetadata(groupId);
        const owner = meta.owner;

        if (author === owner) return;

        const authorMember = meta.participants.find(p => p.id === author);
        if (!authorMember) return;
        if (authorMember.admin !== 'admin' && authorMember.admin !== 'superadmin') return;

        await sock.groupParticipantsUpdate(groupId, [author], 'demote');

    } catch (e) {
        console.error('[groupprotect] ошибка:', e.message);
    }
}

module.exports = { handle };