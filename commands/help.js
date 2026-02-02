// commands/help.js
const path = require('path');
const fs = require('fs');
const { sendCarousel } = require('../lib/sendCarousel');
const getDisplayName = require('../lib/getDisplayName');

async function helpCommand(sock, chatId, message) {
    const senderId = (message && message.key && (message.key.participant || message.key.remoteJid)) || '';
    const name = await getDisplayName(sock, senderId);

    let imgBuffer = null;
    try {
        imgBuffer = fs.readFileSync(path.join(process.cwd(), 'assets', 'котик.jpg'));
    } catch (e) {
        console.warn('картинка не найдена');
    }

    const sections = [
        {
            title: "👥 Для группы",
            rows: [
                { title: ".все", description: "Отметить всех участников", id: "" },
                { title: ".antilink", description: "Включить/выключить защиту от ссылок", id: "" },
                { title: ".мут @пользователь (причина) (срок)", description: "Заглушить участника", id: "" },
                { title: ".размут @пользователь", description: "Разглушить участника", id: "" },
                { title: ".муты", description: "Список замьюченных участников", id: "" },
                { title: ".инфогруппа", description: "Информация о группе", id: "" },
                { title: ".кик @пользователь", description: "Исключить участника", id: "" },
                { title: ".повысить @пользователь", description: "Дать права администратора", id: "" },
                { title: ".понизить @пользователь", description: "Снять права администратора", id: "" }
            ]
        },
        {
            title: "⚙️ Разное",
            rows: [
                { title: ".разработчик", description: "Информация о разработчике", id: "" },
                { title: ".пинг", description: "Проверка скорости отклика бота", id: "" },
                { title: ".ttt", description: "Крестики-нолики", id: "" }
            ]
        },
        {
            title: "🔃 Преобразование",
            rows: [
                { title: ".стикер", description: "Создать стикер из фото/видео", id: "" },
                { title: ".ptv", description: "Конвертировать в круглое видео", id: "" },
                { title: ".vv", description: "Скачивает и отправляет однократное сообщение для просмотра", id: "" },
                { title: ".tts (текст)", description: "Озвучить текст", id: "" }
            ]
        },
        {
            title: "🎭 Аниме команды",
            rows: [
                { title: ".обнять @пользователь", description: "Обнять участника", id: "" },
                { title: ".поцеловать @пользователь", description: "Поцеловать участника", id: "" },
                { title: ".убить @пользователь", description: "Убить участника", id: "" },
                { title: ".кринж @пользователь", description: "Показать кринж", id: "" },
                { title: ".укусить @пользователь", description: "Укусить участника", id: "" },
                { title: ".ударить @пользователь", description: "Ударить участника", id: "" },
                { title: ".облизнуть @пользователь", description: "Облизнуть участника", id: "" }
            ]
        }
    ];

const messages = [
    {
        text: '',
        footer: 'Предлагайте идеи: wa.me/79292991077',
        header: `Привет, ${name}! Как дела?`,
        imageBuffer: imgBuffer,
        imageUrl: null,
         buttons: [
            ['.пинг', '.пинг'] 
        ],
        copy: null,
        urls: [
            ['Присоединиться к группе', 'https://chat.whatsapp.com/FAomD7wIT1S8M52POy7xM2']
        ],
        list: [
            ['Команды', sections]
        ]
    }
];


    try {
        await sendCarousel(sock, chatId, messages, message, {
            bodyText: 'Меню команд',
            footerText: 'Выбери раздел для просмотра команд'
        });
    } catch (error) {
        console.error('ошибка:', error);
        const fallbackText = `Привет ${name}, как дела?\n\nДоступные команды:\n👥 Для группы\n.все, .antilink, .мут, .размут\n\n⚙️ Разное\n.разработчик, .пинг, .ttt\n\nПолный список: wa.me/79292991077`;
        await sock.sendMessage(chatId, { text: fallbackText });
    }
}

module.exports = helpCommand;