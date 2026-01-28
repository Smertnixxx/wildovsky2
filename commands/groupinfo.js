async function groupInfoCommand(sock, chatId, msg) {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);

        const pp = await sock.profilePictureUrl(chatId, 'image')
            .catch(() => 'https://i.imgur.com/2wzGhpF.jpeg');

        const participants = groupMetadata.participants;
        const groupAdmins = participants.filter(p => p.admin);

        const owner =
            groupMetadata.owner ||
            groupAdmins.find(p => p.admin === 'superadmin')?.id ||
            chatId.split('-')[0] + '@s.whatsapp.net';

        const listAdmin = groupAdmins
            .filter(v => v.id !== owner)
            .map((v, i) => `> ${i + 1}. @${v.id.split('@')[0]}`)
            .join('\n') || '> Админы отсутствуют';

        const creationDate = groupMetadata.creation
            ? new Date(groupMetadata.creation * 1000).toLocaleString(
                'ru-RU',
                { timeZone: 'Europe/Moscow', hour12: false }
            )
            : 'Дата не указана';

        const description = groupMetadata.desc || 'Описание отсутствует';

        const restrictSettings = groupMetadata.restrict
            ? '❎ Изменение настроек только админами'
            : '✅ Изменение настроек доступно всем участникам';

        const announceSettings = groupMetadata.announce
            ? '❎ Писать могут только админы'
            : '✅ Писать могут все участники';

        const joinApproval = groupMetadata.joinApprovalMode
            ? '❎ Вступление только с подтверждением'
            : '✅ Свободное вступление';

        const linkedParentInfo = groupMetadata.linkedParent
            ? `🛠️ Связана с сообществом: ${groupMetadata.linkedParent}`
            : '🛠️ Не связана с сообществом';

        const ephemeralInfo = groupMetadata.ephemeralDuration
            ? `⏳ Автоудаление через ${groupMetadata.ephemeralDuration / 3600} ч`
            : '⏳ Исчезающие сообщения выключены';

        const text = `

 Подробная информация о группе

ℹ️ ID группы
> ${groupMetadata.id}

🔖 Название
> ${groupMetadata.subject}

📅 Дата создания
> ${creationDate}

👥 Участники
> ${participants.length}

👑 Владелец
> @${owner.split('@')[0]}

🕵🏻‍♂️ Админы
${listAdmin}

📌 Описание
> ${description}

⚙️ Настройки группы
> ${restrictSettings}
> ${announceSettings}
> ${joinApproval}
> ${linkedParentInfo}
> ${ephemeralInfo}
=========================================
`.trim();

        await sock.sendMessage(chatId, {
            image: { url: pp },
            caption: text,
            mentions: [...groupAdmins.map(v => v.id), owner]
        });

    } catch (e) {
        console.error('groupinfo error:', e);
        await sock.sendMessage(chatId, { text: 'Не удалось получить информацию о группе' });
    }
}

module.exports = groupInfoCommand;
