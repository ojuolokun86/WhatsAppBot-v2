const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');

dotenv.config();

let warnings = {};

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState("auth_info");

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true
        });

        sock.ev.on("creds.update", saveCreds);
        sock.ev.on("connection.update", (update) => handleConnectionUpdate(sock, update));
        sock.ev.on("qr", handleQRCode);
        sock.ev.on("messages.upsert", (m) => handleIncomingMessages(sock, m));
        sock.ev.on("group-participants.update", (update) => handleGroupParticipantsUpdate(sock, update));

        console.log("🤖 Bot started, waiting for connection...");
    } catch (err) {
        console.error("Error starting bot:", err);
        setTimeout(() => startBot(), 5000);
    }
}

function handleConnectionUpdate(sock, update) {
    const { connection } = update;
    if (connection === "open") {
        console.log("✅ Bot Connected to WhatsApp!");
    } else if (connection === "close") {
        console.log("❌ Connection closed, restarting...");
        setTimeout(() => startBot(), 5000);
    }
}

function handleQRCode(qr) {
    qrcode.generate(qr, { small: true });
}

async function handleIncomingMessages(sock, m) {
    const message = m.messages[0];
    if (!message.message || message.key.fromMe) return;

    const msgText = message.message.conversation || message.message.extendedTextMessage?.text || '';
    const isLink = /(https?:\/\/|www\.)\S+/i.test(msgText);
    const participant = message.key.participant || message.key.remoteJid;
    const chatId = message.key.remoteJid;

    console.log("📩 New message received:", msgText);

    await autoReply(sock, msgText, chatId);
    await checkTournamentQuery(sock, msgText, chatId);
    await checkAdminCommands(sock, msgText, chatId, participant);
    await checkSalesMedia(sock, message, chatId, participant);

    if (isLink && chatId.includes('@g.us')) {
        await handleAntiLink(sock, message, msgText, chatId, participant);
    }
}

async function autoReply(sock, msgText, chatId) {
    const responses = {
        "hi": "👋 Hello! I'm GODS GRACE, how may I help you today?",
        "hello": "👋 Hello! I'm GODS GRACE, how may I help you today?",
        "good morning": "🌞 Good morning, how was your night? Hope you enjoyed it. How may I help you?",
        "good evening": "🌆 Good evening, how was your day? Hope you enjoyed it. How is your family?",
        "how are you doing": "😊 I'm fine, and you?",
        "good afternoon": "☀️ Good afternoon! Hope you're having a great day!",
        "how far": "👌 I'm good.",
        "bro": "Yes brotherly, hope everywhere good."
    };

    if (responses[msgText.toLowerCase()]) {
        await sock.sendMessage(chatId, { text: responses[msgText.toLowerCase()] });
    }
}

async function checkTournamentQuery(sock, msgText, chatId) {
    if (/(league|competition|tournament|ongoing|join|register|sign up)/i.test(msgText)) {
        await sock.sendMessage(chatId, { text: "📢 For more information about tournaments, competitions, or leagues, please DM the admin. ⚽🏆" });
    }
}

async function checkAdminCommands(sock, msgText, chatId, participant) {
    if (msgText.startsWith("@bot remove")) {
        const userToRemove = msgText.split("@bot remove ")[1] + "@s.whatsapp.net";
        await sock.groupParticipantsUpdate(chatId, [userToRemove], 'remove');
    }
    if (msgText.startsWith("@bot tag everyone")) {
        const groupMetadata = await sock.groupMetadata(chatId);
        const members = groupMetadata.participants.map(m => m.id);
        const customMessage = msgText.replace("@bot tag everyone", "").trim();
        await sock.sendMessage(chatId, { text: `@everyone ${customMessage}`, mentions: members });
    }
}

async function handleGroupParticipantsUpdate(sock, update) {
    const { id, participants, action } = update;
    const groupMetadata = await sock.groupMetadata(id);
    const isGedionAdmin = groupMetadata.participants.some(p => p.id === sock.user.id && p.admin);
    if (action === 'add' && isGedionAdmin) {
        for (const participant of participants) {
            await sock.sendMessage(id, {
                text: `Welcome to the Efootball Dynasty family @${participant.split('@')[0]}, where legends are made! 🎉⚽ We’re beyond pumped to have you here! Brace yourself for non-stop fun, legendary tournaments, and fierce competition! 🏆💥 Let’s create unforgettable moments and take this Dynasty to the next level! 🔥👑`,
                mentions: [participant]
            });
        }
    }
}

async function handleAntiLink(sock, message, msgText, chatId, participant) {
    await sock.sendMessage(chatId, { delete: message.key });
    warnings[participant] = (warnings[participant] || 0) + 1;
    await sock.sendMessage(chatId, { text: `⚠️ Warning ${warnings[participant]}/2: No links allowed!` });
    if (warnings[participant] >= 2) {
        await sock.groupParticipantsUpdate(chatId, [participant], 'remove');
    }
}

async function checkSalesMedia(sock, message, chatId, participant) {
    if (message.message.imageMessage && message.message.imageMessage.caption) {
        const caption = message.message.imageMessage.caption.toLowerCase();
        if (caption.includes("swap") || caption.includes("sale") || caption.includes("buy") || caption.includes("sell")) {
            await sock.sendMessage(chatId, { delete: message.key });
            await sock.sendMessage(chatId, { text: `🚫 No sales or swap posts allowed, @${participant.split('@')[0]}.` });
        }
    }
}

startBot();
