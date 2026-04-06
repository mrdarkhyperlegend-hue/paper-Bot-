const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const cheerio = require('cheerio');

let userCache = {}; 

async function startEduBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

       
        if (text.startsWith('.search')) {
            const query = text.replace('.search', '').trim().toLowerCase();
            if (!query) return sock.sendMessage(from, { text: 'කරුණාකර සෙවිය යුතු වචනයක් ඇතුළත් කරන්න. (උදා: .search ict)' });

            await sock.sendMessage(from, { text: `🔍 "${query}" සඳහා පේපර්ස් සොයමින් පවතිනවා...` });

            try {
                const { data } = await axios.get('https://govdoc.lk/advanced-level-ict-past-papers/');
                const $ = cheerio.load(data);
                let results = [];

                $('a').each((i, el) => {
                    const name = $(el).text().trim();
                    const link = $(el).attr('href');
                    
                    if (link && link.endsWith('.pdf') && name.toLowerCase().includes(query)) {
                        results.push({ name, link });
                    }
                });

                if (results.length > 0) {
                    userCache[from] = results;
                    let listMsg = `📂 *සොයාගත් ප්‍රතිඵල (${results.length})* 📂\n\n`;
                    results.forEach((p, i) => {
                        listMsg += `${i + 1}. ${p.name}\n`;
                    });
                    listMsg += `\n💡 පේපර් එක ලබා ගැනීමට අදාළ *අංකය* පමණක් එවන්න.`;
                    await sock.sendMessage(from, { text: listMsg });
                } else {
                    await sock.sendMessage(from, { text: 'සමාවන්න, ඔබ සෙවූ වචනයට ගැලපෙන කිසිවක් හමු නොවීය.' });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: 'සර්වර් එකට සම්බන්ධ වීමේ දෝෂයකි.' });
            }
        }

        else if (!isNaN(text) && userCache[from]) {
            const index = parseInt(text) - 1;
            const item = userCache[from][index];

            if (item) {
                await sock.sendMessage(from, { text: `📥 *${item.name}* ඩවුන්ලෝඩ් වෙමින් පවතී...` });
                const response = await axios({ method: 'get', url: item.link, responseType: 'arraybuffer' });
                
                await sock.sendMessage(from, { 
                    document: Buffer.from(response.data), 
                    mimetype: 'application/pdf', 
                    fileName: `${item.name}.pdf`,
                    caption: 'මෙන්න ඔයා ඉල්ලපු පේපර් එක. සාර්ථකව විභාගයට සූදානම් වෙන්න! 🎓'
                });
            }
        }
    });
}

startEduBot();
