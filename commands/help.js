// commands/help.js
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const getDisplayName = require('../lib/getDisplayName');
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

async function helpCommand(sock, chatId, message) {
    const senderId = (message && message.key && (message.key.participant || message.key.remoteJid)) || '';
    const name = await getDisplayName(sock, senderId);
    const userId = senderId.split('@')[0];

    const sections = [
        {
            title: "👥 Для группы",
            rows: [
                { title: ".все", description: "Отметить всех участников", id: "cmd_vse" },
                { title: ".antilink", description: "Включить/выключить защиту от ссылок", id: "cmd_antilink" },
                { title: ".мут @пользователь (причина) (срок)", description: "Заглушить участника", id: "cmd_mute" },
                { title: ".размут @пользователь", description: "Разглушить участника", id: "cmd_unmute" },
                { title: ".муты", description: "Список замьюченных участников", id: "cmd_mutes" },
                { title: ".инфогруппа", description: "Информация о группе", id: "cmd_groupinfo" },
                { title: ".кик @пользователь", description: "Исключить участника", id: "cmd_kick" },
                { title: ".повысить @пользователь", description: "Дать права администратора", id: "cmd_promote" },
                { title: ".понизить @пользователь", description: "Снять права администратора", id: "cmd_demote" }
            ]
        },
        {
            title: "⚙️ Разное",
            rows: [
                { title: ".разработчик", description: "Информация о разработчике", id: "cmd_dev" },
                { title: ".пинг", description: "Проверка скорости отклика бота", id: "cmd_ping" },
                { title: ".гид (ссылка на группу)", description: "Показывает информацию о группе по ссылке", id: "cmd_ping" },
                { title: ".поиск", description: "Ищет картинки по вашему запросу в интернете", id: "cmd_ping" },
                { title: ".котик", description: "Отправляет случайную картинку котика", id: "cmd_ping" },
                { title: ".ttt", description: "Крестики-нолики", id: "cmd_ttt" }
            ]
        },
        {
            title: "🔃 Преобразование",
            rows: [
                { title: ".стикер", description: "Создать стикер из фото/видео", id: "cmd_sticker" },
                { title: ".ptv", description: "Конвертировать в круглое видео", id: "cmd_ptv" },
                { title: ".vv", description: "Скачивает и отправляет однократное сообщение для просмотра", id: "cmd_vv" },
                { title: ".tts (текст)", description: "Озвучить текст", id: "cmd_tts" }
            ]
        },
        {
            title: "🎭 Аниме команды",
            rows: [
                { title: ".обнять @пользователь", description: "", id: "" },
                { title: ".поцеловать @пользователь", description: "", id: "" },
                { title: ".убить @пользователь", description: "", id: "" },
                { title: ".кринж @пользователь", description: "", id: "" },
                { title: ".скушать @пользователь", description: "", id: "" },
                { title: ".укусить @пользователь", description: "", id: "" },
                { title: ".танцевать @пользователь", description: "", id: "" },
                { title: ".подмигнуть @пользователь", description: "", id: "" },
                { title: ".пнуть @пользователь", description: "", id: "" },
                { title: ".тык @пользователь", description: "", id: "" },
                { title: ".шлепнуть @пользователь", description: "", id: "" },
                { title: ".ударить @пользователь", description: "", id: "" },
                { title: ".облизнуть @пользователь", description: "", id: "" }
            ]
        },
        {
            title: "💘 Браки (ваш брак отображается в .стата)",
            rows: [
                { title: ".брак @пользователь", description: "Отправить запрос на брак пользователю", id: "cmd_marry" },
                 { title: ".браки", description: "Посмотреть активный список браков в чате", id: "cmd_marry" },
                { title: ".развод @пользователь", description: "Расстаться", id: "cmd_divorce" }
            ]
        },
                {
            title: "🗝️ Команды без префиксов",
            rows: [
                { title: "бот кто (текст)", description: "бот напишет кто является (текст) в группе", id: "cmd_marry" },
            ]
        },
        {
            title: "🏆 Таблица лидеров",
            rows: [
                { title: ".сообщения", description: "Показывает количество сообщений написанными участниками в чате", id: "cmd_marry" },
              
            ]
        },
                {
            title: "👑 Команды разработчика",
            rows: [
                { title: ".exec (quoted message)", description: "structure message", id: "cmd_marry" },
            ]
        }
    ];

    try {
        // Получаем картинку котика
        let res = await fetch('https://cataas.com/cat');
        let imgBuffer = await res.buffer();

        // Подготавливаем медиа
        const media = await prepareWAMessageMedia(
            { image: imgBuffer },
            { upload: sock.waUploadToServer }
        );

        const msg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `Привет, @${userId}! Как дела?\nВыбери раздел команд:`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: "Предлагайте идеи: wa.me/79292991077"
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: ``,
                            hasMediaAttachment: true,
                            imageMessage: media.imageMessage
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "Список команд",
                                        sections: sections
                                    })
                                }
                            ]
                        }),
                        contextInfo: {
                            mentionedJid: [senderId]
                        }
                    })
                }
            }
        }, { quoted: message });

        await sock.relayMessage(chatId, msg.message, {
            messageId: msg.key.id
        });
    } catch (error) {
        console.error('ошибка отправки меню:', error);
        const fallback = `Привет @${userId}!\n\nДоступные команды:\n👥 Для группы\n.все, .antilink, .мут, .размут\n\n⚙️ Разное\n.разработчик, .пинг, .ttt\n\nПолный список: wa.me/79292991077`;
        await sock.sendMessage(chatId, { 
            text: fallback,
            mentions: [senderId]
        });
    }
}

module.exports = helpCommand;