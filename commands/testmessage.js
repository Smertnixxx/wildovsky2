const fs = require('fs');
const path = require('path');

async function testmessage(sock, chatId, message, senderId, isOwner, isGroup) {
    // Проверки
    if (isGroup) return; // только в личке
    
    let videoBuffer;
    try {
        videoBuffer = fs.readFileSync(
            path.join(process.cwd(), 'assets', 'B-tbADnJ.mp4')
        );
    } catch (e) {
        console.error('[testmessage] Видео не найдено');
        return;
    }

    const caption =
        "https://chat.whatsapp.com/FAomD7wIT1S8M52POy7xM2?mode=gi_t\n\n" +
        "СТАРАЯ ЛЕГЕНДА ВЕРНУЛАСЬ!?\n" +
        "да, комару чат! Классный чат с интересным ботом просто напишите .меню и узнайте все что сдесь есть\n" +
        "Актив имеется и каждый новый участник дает мотивацию к еще большему активу";

    await sock.sendMessage(
        chatId,
        {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption,
            gifPlayback: true,
            width: 220,
            height: 220
        },
        { quoted: message }
    );
}

module.exports = testmessage;