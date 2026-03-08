const klybnikagroup = '120363420486491862@g.us';

async function handle(sock, groupId, participants, author) {
    if (groupId !== klybnikagroup) return;
    if (!author) return;
    try {
        const meta = await sock.groupMetadata(groupId);
        const owner = meta.owner;
        if (author === owner) return;
        const loshara = meta.participants.find(p => p.id === author);
        if (!loshara) return;
        if (loshara.admin !== 'admin' && loshara.admin !== 'superadmin') return;
        await sock.groupParticipantsUpdate(groupId, [author], 'demote');
    } catch (e) {
        console.error(e.message);
    }
}

async function handleDemote(sock, groupId, participants, author) {
    if (groupId !== klybnikagroup) return;
    if (!author) return;
    try {
        const meta = await sock.groupMetadata(groupId);
        const owner = meta.owner;
        if (author === owner) return;
        const loshara = meta.participants.find(p => p.id === author);
        if (!loshara) return;
        if (loshara.admin !== 'admin' && loshara.admin !== 'superadmin') return;

        await sock.groupParticipantsUpdate(groupId, [author], 'demote');
        await sock.groupParticipantsUpdate(groupId, participants, 'promote');
    } catch (e) {
        console.error(e.message);
    }
}

module.exports = { handle, handleDemote };