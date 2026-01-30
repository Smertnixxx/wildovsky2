async function testcarousel(sock, chatId, message) {
    const sections = [
        {
            title: 'Выберите действие',
            rows: [
                {header: 'Меню', title: 'Главное меню', description: 'Открыть главное меню бота', id: '.menu'},
                {header: 'Помощь', title: 'Помощь', description: 'Показать справку', id: '.help'},
                {header: 'Инфо', title: 'Информация', description: 'Информация о боте', id: '.botinfo'}
            ]
        }
    ];

    const messages = [
        [
            'Описание первого слайда',
            'Footer первого слайда',
            'https://telegra.ph/file/24b24c495b5384b218b2f.jpg',
            [
                ['Кнопка 1', '.menu'],
                ['Кнопка 2', '.help']
            ],
            [['Текст для копирования 1'], ['Текст для копирования 2']],  // Изменено: массив массивов
            [
                ['GitHub', 'https://github.com'],
                ['Google', 'https://google.com']
            ],
            [
                ['Открыть список', sections]
            ]
        ],
        [
            'Описание второго слайда',
            'Footer второго слайда',
            'https://telegra.ph/file/e9239fa926d3a2ef48df2.jpg',
            [
                ['Кнопка А', '.test1'],
                ['Кнопка Б', '.test2']
            ],
            [['Копировать это 1'], ['Копировать это 2']],  // Изменено: массив массивов
            [
                ['YouTube', 'https://youtube.com']
            ],
            [
                ['Список 2', sections]
            ]
        ],
        [
            'Описание третьего слайда',
            'Footer третьего слайда',
            'https://telegra.ph/file/ec725de5925f6fb4d5647.jpg',
            [
                ['Кнопка X', '.test3'],
                ['Кнопка Y', '.test4']
            ],
            [],  // Пустой массив для copy
            [
                ['Wikipedia', 'https://wikipedia.org']
            ],
            []  // Пустой массив для list
        ]
    ];

    try {
        await sock.sendCarousel(
            chatId,
            'Тестовый карусель',
            'Это тестовое сообщение',
            'Заголовок',
            messages,
            message
        );
        
        await sock.sendMessage(chatId, { text: '✅ Карусель отправлена успешно' }, { quoted: message });
    } catch (error) {
        console.error('Ошибка отправки карусели:', error);
        await sock.sendMessage(chatId, { text: '❌ Ошибка при отправке карусели\n' + error.message }, { quoted: message });
    }
}

module.exports = { testcarousel };