const fs = require('fs')
const STORE_FILE = './baileys_store.json'

let MAX_MESSAGES = 20

try {
    const settings = require('../settings.js')
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = settings.maxStoreMessages
    }
} catch (e) {}

const store = {
    messages: {},
    contacts: {},
    chats: {},

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
                this.contacts = data.contacts || {}
                this.chats = data.chats || {}
                this.messages = data.messages || {}
                this.cleanupData()
                console.log(`[store] Загружено контактов: ${Object.keys(this.contacts).length}`)
            }
        } catch (e) {
            console.warn('Failed to read store file:', e.message)
        }
    },

    writeToFile(filePath = STORE_FILE) {
        try {
            const data = JSON.stringify({
                contacts: this.contacts,
                chats: this.chats,
                messages: this.messages
            })
            fs.writeFileSync(filePath, data)
        } catch (e) {
            console.warn('Failed to write store file:', e.message)
        }
    },

    cleanupData() {
        if (this.messages) {
            Object.keys(this.messages).forEach(jid => {
                if (typeof this.messages[jid] === 'object' && !Array.isArray(this.messages[jid])) {
                    const messages = Object.values(this.messages[jid])
                    this.messages[jid] = messages.slice(-MAX_MESSAGES)
                }
            })
        }
    },

    // Единый метод обновления контакта — не теряет существующие данные
    _updateContact(contact) {
        if (!contact?.id) return
        const id = contact.id
        this.contacts[id] = {
            ...this.contacts[id],       // сохраняем что было
            id,
            name: contact.notify || contact.name || this.contacts[id]?.name || '',
            notify: contact.notify || this.contacts[id]?.notify,
            vname: contact.vname || this.contacts[id]?.vname,
            verifiedName: contact.verifiedName || this.contacts[id]?.verifiedName
        }
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (!msg.key?.remoteJid) return
                const jid = msg.key.remoteJid
                this.messages[jid] = this.messages[jid] || []
                this.messages[jid].push(msg)
                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES)
                }
            })
        })

        // Обновление существующих контактов
        ev.on('contacts.update', (contacts) => {
            contacts.forEach(c => this._updateContact(c))
        })

        // Начальная синхронизация контактов от WhatsApp — было пропущено
        ev.on('contacts.upsert', (contacts) => {
            contacts.forEach(c => this._updateContact(c))
        })

        ev.on('chats.set', ({ chats }) => {
            chats.forEach(chat => {
                this.chats[chat.id] = {
                    ...this.chats[chat.id],
                    id: chat.id,
                    subject: chat.subject || this.chats[chat.id]?.subject || '',
                    name: chat.name || this.chats[chat.id]?.name || ''
                }
            })
        })

        // Обновления чатов после начальной синхронизации
        ev.on('chats.update', (chats) => {
            chats.forEach(chat => {
                if (!chat.id) return
                this.chats[chat.id] = {
                    ...this.chats[chat.id],
                    id: chat.id,
                    subject: chat.subject || this.chats[chat.id]?.subject || '',
                    name: chat.name || this.chats[chat.id]?.name || ''
                }
            })
        })
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(m => m.key.id === id) || null
    },

    getStats() {
        let totalMessages = 0
        let totalContacts = Object.keys(this.contacts).length
        let totalChats = Object.keys(this.chats).length
        
        Object.values(this.messages).forEach(chatMessages => {
            if (Array.isArray(chatMessages)) {
                totalMessages += chatMessages.length
            }
        })
        
        return {
            messages: totalMessages,
            contacts: totalContacts,
            chats: totalChats,
            maxMessagesPerChat: MAX_MESSAGES
        }
    }
}

module.exports = store