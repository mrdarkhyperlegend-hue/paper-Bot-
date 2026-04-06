const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const cheerio = require('cheerio');
const pino = require('pino');
const settings = require('./settings'); // Settings import කිරීම

let userCache = {}; 

async function startEduBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({ 
        auth: state, 
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // අනවශ්‍ය logs වළක්වයි
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const prefix = settings.prefix;

        // 1. මෙනු එක පෙන්වීම
        if (text === `${prefix}menu` || text === 'menu' || text === 'hi') {
            const formattedMenu = settings.menu.replace('[prefix]', prefix);
            
            await sock.sendMessage(from, { 
                text: formattedMenu,
                contextInfo: {
                    externalAdReply: {
                        title: settings.botName,
                        body: 'ඔබේ අධ්‍යාපන සහකරු',
                        mediaType: 1,
                        sourceUrl: 'https://govdoc.lk',
                        thumbnailUrl: 'https://i.ibb.co/LzNf9mS/edu-bot.jpg' // මෙතනට ඔයාගේ ඉමේජ් ලින්ක් එකක් දාන්න
                    }
                }
            });
        }

        // 2. සර්ච් කිරීම (Search Logic)
        else if (text.startsWith(`${prefix}search`)) {
            const query = text.replace(`${prefix}search`, '').trim().toLowerCase();
            if (!query) return sock.sendMessage(from, { text: `කරුණාකර සෙවිය යුතු වචනයක් ඇතුළත් කරන්න. (උදා: ${prefix}search ict)` });

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

        // 3. අංකය ලැබුණු විට ඩවුන්ලෝඩ් කිරීම
        else if (!isNaN(text) && userCache[from]) {
            const index = parseInt(text) - 1;
            const item = userCache[from][index];

            if (item) {
                await sock.sendMessage(from, { text: `📥 *${item.name}* ඩවුන්ලෝඩ් වෙමින් පවතී...` });
                try {
                    const response = await axios({ method: 'get', url: item.link, responseType: 'arraybuffer' });
                    await sock.sendMessage(from, { 
                        document: Buffer.from(response.data), 
                        mimetype: 'application/pdf', 
                        fileName: `${item.name}.pdf`,
                        caption: `මෙන්න ඔයා ඉල්ලපු පේපර් එක. ✅\n\n*${settings.botName}*`
                    });
                } catch (e) {
                    await sock.sendMessage(from, { text: 'ඩවුන්ලෝඩ් කිරීමේ දෝෂයකි.' });
                }
            }
        }
    });
}

startEduBot();
startEduBot();
