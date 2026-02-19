async function getGroupIdCommand(sock, chatId, msg) {
    try {
        // Получаем текст сообщения
        const text = msg.message?.conversation?.trim() ||
                    msg.message?.extendedTextMessage?.text?.trim() || '';
        
        // Извлекаем ссылку из текста
        const args = text.split(' ').slice(1).join(' ').trim();
        
        if (!args) {
            await sock.sendMessage(chatId, {
                text: `❌ *Использование:*
.getgroupid <ссылка на группу>

*Пример:*
.getgroupid https://chat.whatsapp.com/ABC123XYZ`
            }, { quoted: msg });
            return;
        }
        
        // Проверяем формат ссылки
        if (!args.includes('chat.whatsapp.com/')) {
            await sock.sendMessage(chatId, {
                text: '❌ Неверный формат ссылки.\nИспользуйте полную ссылку на группу WhatsApp.'
            }, { quoted: msg });
            return;
        }
        
        // Извлекаем код приглашения из ссылки
        const inviteCode = args.split('chat.whatsapp.com/')[1].split('?')[0].trim();
        
        if (!inviteCode) {
            await sock.sendMessage(chatId, {
                text: '❌ Не удалось извлечь код приглашения из ссылки.'
            }, { quoted: msg });
            return;
        }
        
        // Получаем информацию о группе по коду приглашения
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        
        // Пробуем получить фото группы
        const pp = await sock.profilePictureUrl(groupInfo.id, 'image')
            .catch(() => 'https://i.imgur.com/2wzGhpF.jpeg');
        
        const owner = groupInfo.owner || 'Неизвестно';
        
        const creationDate = groupInfo.creation
            ? new Date(groupInfo.creation * 1000).toLocaleString(
                'ru-RU',
                { timeZone: 'Europe/Moscow', hour12: false }
            )
            : 'Дата не указана';
        
        const description = groupInfo.desc || 'Описание отсутствует';
        
        const text_response = `
📋 Информация о группе по ссылке

🆔 ID группы
> ${groupInfo.id}

🔖 Название
> ${groupInfo.subject || 'Без названия'}

📅 Дата создания
> ${creationDate}

👥 Участников
> ${groupInfo.size || 'Неизвестно'}

👑 Владелец
> ${owner !== 'Неизвестно' ? '@' + owner.split('@')[0] : 'Неизвестно'}

📌 Описание
> ${description}

🔗 Код приглашения
> ${inviteCode}
=========================================
`.trim();

        const mentions = [];
        if (owner !== 'Неизвестно') {
            mentions.push(owner);
        }

        await sock.sendMessage(chatId, {
            image: { url: pp },
            caption: text_response,
            mentions: mentions
        }, { quoted: msg });

    } catch (e) {
        console.error('getgroupid error:', e);
        
        let errorMsg = '❌ Не удалось получить информацию о группе.';
        
        if (e.message?.includes('not-authorized') || e.message?.includes('401')) {
            errorMsg = '❌ Нет доступа к этой группе.\nВозможно, ссылка недействительна или группа приватная.';
        } else if (e.message?.includes('gone') || e.message?.includes('404')) {
            errorMsg = '❌ Эта ссылка-приглашение больше не действительна.';
        } else if (e.message?.includes('rate') || e.message?.includes('429')) {
            errorMsg = '❌ Слишком много запросов. Попробуйте позже.';
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMsg 
        }, { quoted: msg });
    }
}

module.exports = getGroupIdCommand;