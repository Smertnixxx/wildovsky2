const TicTacToe = require('../lib/tictactoe');

let pendingGames = {};
const GAME_TIMEOUT = 5 * 60 * 1000; // 5 минут

const symbols = {
    X: '❎',
    O: '⭕',
    1: '1️⃣',
    2: '2️⃣',
    3: '3️⃣',
    4: '4️⃣',
    5: '5️⃣',
    6: '6️⃣',
    7: '7️⃣',
    8: '8️⃣',
    9: '9️⃣',
};

const parsemention = (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
};

const generateGameText = (room) => {
    const arr = room.game.render().map(v => symbols[v] || v);

    return `
Игра началась! Ход: @${room.game.currentTurn.split('@')[0]}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

*Правила игры в Крестики-нолики*
> Составьте 3 символа в ряд (по вертикали, горизонтали или диагонали), чтобы победить.
`.trim();
};

let handler = async (m, { conn, usedPrefix, command, text }) => {
    conn.game = conn.game || {};

    const now = Date.now();

    if (pendingGames[m.chat]) {
        return m.reply(`❗ В этом чате уже ищут соперника для игры в Крестики-нолики. Подождите или присоединитесь к текущему вызову.`);
    }

    if (Object.values(conn.game).find(
        room => room?.id?.startsWith('tictactoe') && room.state === 'PLAYING' && [room.x, room.o].includes(m.chat)
    )) {
        return m.reply(`❗ В этом чате уже запущена игра. Дождитесь её завершения.`);
    }

    if (Object.values(conn.game).find(
        room => room?.id?.startsWith('tictactoe') && [room.game.playerX, room.game.playerO].includes(m.sender)
    )) {
        return m.reply(`❗ Вы уже участвуете в игре. Завершите её перед началом новой.`);
    }

    if (!text) text = m.sender.split('@')[0];

    let room = Object.values(conn.game).find(
        room => room?.state === 'WAITING' && room.name === text
    );

    if (room) {
        if (!room.o) {
            room.o = m.chat;
            room.game.playerO = m.sender;
            room.state = 'PLAYING';
            room.lastMoveAt = now;

            const gameText = generateGameText(room);

            await conn.sendMessage(room.x, { text: gameText, mentions: parsemention(gameText) });
            await conn.sendMessage(room.o, { text: gameText, mentions: parsemention(gameText) });
        } else {
            return m.reply(`❗ В этой комнате уже есть два игрока!`);
        }
    } else {
        room = {
            id: 'tictactoe-' + (+new Date),
            x: m.chat,
            o: '',
            game: new TicTacToe(m.sender, 'o'),
            state: 'WAITING',
            name: text,
            createdAt: now,
            lastMoveAt: now,
        };

        pendingGames[m.chat] = room;

        const waitingMessage = await conn.sendMessage(m.chat, {
            text: `Ищем партнера для игры в Крестики-нолики!\n\nЧтобы присоединиться, поставьте реакцию "👍" на это сообщение.`,
        });

        pendingGames[waitingMessage.key.id] = room;

        setTimeout(() => {
            if (pendingGames[m.chat] === room) {
                delete pendingGames[m.chat];
                conn.sendMessage(m.chat, {
                    text: `⏳ Партнёр для игры не найден. Попробуйте позже.`,
                });
            }
        }, GAME_TIMEOUT);

        conn.game[room.id] = room;
    }
};

const thumbsUpReactions = ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'];

let reactionHandler = async function (m, { conn }) {
    if (!m.isGroup || m.mtype !== 'reactionMessage') return;

    const messageID = m.message.reactionMessage?.key?.id;
    const reactionText = m.message.reactionMessage?.text || '';

    if (!thumbsUpReactions.includes(reactionText)) return;

    const room = pendingGames[messageID];
    if (!room || room.state !== 'WAITING') return;

    const chatId = m.key?.remoteJid || m.chat;
    const senderId = m.key?.participant || m.key?.remoteJid || m.sender;

    if (room.game.playerX === senderId) {
        if (m.reply) {
            return m.reply('❗ Вы не можете играть против самого себя!');
        }
        await conn.sendMessage(chatId, { text: 'ты не можешь против самого себя играть дурачок' });
        return;
    }

    room.o = chatId;
    room.game.playerO = senderId;
    room.state = 'PLAYING';
    room.lastMoveAt = Date.now();

    const gameText = generateGameText(room);

    await conn.sendMessage(room.o, { text: gameText, mentions: parsemention(gameText) });
    if (room.x !== room.o) {
        await conn.sendMessage(room.x, { text: gameText, mentions: parsemention(gameText) });
    }
    delete pendingGames[chatId];
    delete pendingGames[messageID];
};

handler.before = reactionHandler;

handler.command = ['тиктак', 'ttt', 'кн'];
handler.group = true;
handler.exp = 0;

// Compatibility wrapper for main.js which expects CommonJS exports:
async function tictactoeCommand(sock, chatId, senderId, text) {
    const m = {
        chat: chatId,
        sender: senderId,
        isGroup: (chatId || '').endsWith('@g.us'),
        reply: async (txt) => { try { await sock.sendMessage(chatId, { text: txt }); } catch (e) {} },
        key: { remoteJid: chatId },
        message: {}
    };
    await handler(m, { conn: sock, usedPrefix: '.', command: 'ttt', text });
}

async function handleTicTacToeMove(sock, chatId, senderId, text) {
    try {
        const conn = sock;
        conn.game = conn.game || {};

        const room = Object.values(conn.game).find(room =>
            room?.id?.startsWith('tictactoe') &&
            [room.game.playerX, room.game.playerO].includes(senderId) &&
            room.state === 'PLAYING'
        );

        if (!room) return;

        const isSurrender = /^(сдаться|сдаюсь|surrender|give up)$/i.test(text);
        if (!isSurrender && !/^[1-9]$/.test(text)) return;

        if (senderId !== room.game.currentTurn && !isSurrender) {
            await conn.sendMessage(chatId, { text: 'это не твой ход' });
            return;
        }

        let ok = isSurrender ? true : room.game.turn(
            senderId === room.game.playerO,
            parseInt(text) - 1
        );

        if (!ok) {
            await conn.sendMessage(chatId, { text: 'ЗАНЯТО НАУЙ' });
            return;
        }

        let winner = room.game.winner;
        let isTie = room.game.turns === 9;

        const arr = room.game.render().map(v => symbols[v] || v);

        if (isSurrender) {
            winner = senderId === room.game.playerX ? room.game.playerO : room.game.playerX;
            await conn.sendMessage(chatId, {
                text: `@${senderId.split('@')[0]} сдался! Победил @${winner.split('@')[0]}!`,
                mentions: [senderId, winner]
            });
            delete conn.game[room.id];
            return;
        }

        let gameStatus;
        if (winner) {
            gameStatus = `@${winner.split('@')[0]} выигрывает!`;
        } else if (isTie) {
            gameStatus = `Ничья!`;
        } else {
            gameStatus = `🎲 Ход: @${room.game.currentTurn.split('@')[0]}`;
        }

        const str = `
*Крестики-нолики*

${gameStatus}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

1 Игрок ❎: @${room.game.playerX.split('@')[0]}
2 Игрок ⭕: @${room.game.playerO.split('@')[0]}

${!winner && !isTie ? '• Введите номер (1-9), чтобы сделать ход\n• Введите *сдаться* чтобы сдаться' : ''}
`.trim();

        const mentions = [
            room.game.playerX,
            room.game.playerO,
            ...(winner ? [winner] : [room.game.currentTurn])
        ];

        await conn.sendMessage(room.x, { text: str, mentions });
        if (room.x !== room.o) {
            await conn.sendMessage(room.o, { text: str, mentions });
        }

        if (winner || isTie) {
            delete conn.game[room.id];
        }
    } catch (error) {
        console.error('Error in tictactoe move:', error);
    }
}

module.exports = {
    tictactoeCommand,
    handleTicTacToeMove,
    handleReaction: reactionHandler
};