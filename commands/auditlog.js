const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const TARGET_GROUP = '120363420486491862@g.us';
const TTL = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

// массив отсортирован по времени — всегда append в конец
const entries = [];

// очистка каждые 2 минуты — splice от начала (O(n) но n маленький)
setInterval(() => {
    const threshold = Date.now() - TTL;
    let cut = 0;
    while (cut < entries.length && entries[cut].time < threshold) cut++;
    if (cut > 0) entries.splice(0, cut);
}, 2 * 60 * 1000);

function msk(ts) {
    const d = new Date(ts + 3 * 60 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}.${mo} ${hh}:${mm} МСК`;
}

function push(icon, event, author, detail) {
    if (entries.length >= MAX_ENTRIES) entries.shift();
    entries.push({ time: Date.now(), icon, event, author, detail });
}

// вызывается из handleGroupParticipantUpdate
function log(groupId, icon, event, author, detail = '') {
    if (groupId !== TARGET_GROUP) return;
    push(icon, event, author, detail);
}

function active() {
    const threshold = Date.now() - TTL;
    return entries.filter(e => e.time >= threshold);
}

async function cmd(sock, chatId, senderId, message) {
    const list = active();

    if (list.length === 0) {
        await sock.sendMessage(chatId, {
            text: '📋 Журнал пуст — за последние 30 минут событий не было'
        }, { quoted: message });
        return;
    }

    // последние 20, от новых к старым
    const recent = list.slice(-20).reverse();

    // WhatsApp ограничивает: макс ~10 строк на секцию, макс 3 секции
    const toRows = (slice) => slice.map((e, i) => ({
        title: `${e.icon} ${e.event}`,
        description: `👤 ${e.author}${e.detail ? ' · ' + e.detail : ''}\n🕐 ${msk(e.time)}`,
        id: `a_${i}`
    }));

    const sections = [];
    if (recent.length > 0) sections.push({ title: `Последние (${Math.min(recent.length, 10)})`, rows: toRows(recent.slice(0, 10)) });
    if (recent.length > 10) sections.push({ title: `Ранее`, rows: toRows(recent.slice(10, 20)) });

    try {
        const msg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `📋 *Журнал аудита*\nСобытий за 30 мин: *${list.length}*\nПоказаны последние ${recent.length}`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: ''
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: 'Журнал аудита',
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [{
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({ title: 'Открыть журнал', sections })
                            }]
                        })
                    })
                }
            }
        }, { quoted: message });

        await sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });
    } catch {

        const text = recent
            .map(e => `${e.icon} *${e.event}*\n👤 ${e.author}${e.detail ? ' · ' + e.detail : ''}\n🕐 ${msk(e.time)}`)
            .join('\n\n');
        await sock.sendMessage(chatId, { text: `📋 *Журнал аудита*\n\n${text}` }, { quoted: message });
    }
}

module.exports = { cmd, log };