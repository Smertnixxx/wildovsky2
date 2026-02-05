const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function ensureDir() {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
    try {
        ensureDir();
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), 'utf8');
            return {};
        }
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        console.error('userdb.load error', e);
        return {};
    }
}

function save(users) {
    try {
        ensureDir();
        fs.writeFileSync(USERS_FILE, JSON.stringify(users || {}, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('userdb.save error', e);
        return false;
    }
}

module.exports = { load, save };

