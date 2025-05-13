// server.js
require('dotenv').config(); // Load .env file from project root
const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { rimraf } = require('rimraf'); // Named import for rimraf v4+

const app = express();
const port = process.env.PORT || 5002;

const APP_DIR = __dirname;
const UPLOAD_FOLDER = path.join(APP_DIR, 'uploads');
const DATA_FOLDER = path.join(APP_DIR, 'data');
const CHROME_USER_DATA_FOLDER = path.join(APP_DIR, 'chrome_user_data_puppeteer');

// Ensure directories exist
(async () => {
    try {
        await fs.mkdir(UPLOAD_FOLDER, { recursive: true });
        await fs.mkdir(DATA_FOLDER, { recursive: true });
        await fs.mkdir(CHROME_USER_DATA_FOLDER, { recursive: true });
        // Subdirectories for bot_worker.js (as per your Python script's structure)
        await fs.mkdir(path.join(DATA_FOLDER, "whatsapp_chats"), { recursive: true });
        await fs.mkdir(path.join(DATA_FOLDER, "whatsapp_images"), { recursive: true });
        console.log("[SERVER] Required directories ensured/created.");
    } catch (err) {
        console.error("[SERVER] Error creating directories:", err);
    }
})();

app.set('view engine', 'ejs');
app.set('views', path.join(APP_DIR, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use('/public', express.static(path.join(__dirname, 'public'))); // If you add CSS/JS files

// --- Bot Process Management ---
let botProcess = null;
let botLogs = [];
const MAX_LOG_LINES = 500;
let currentGeminiApiKey = process.env.GEMINI_API_KEY || ""; // Load from env or last form submission
let sseClients = []; // For live view

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_FOLDER)
    },
    filename: function (req, file, cb) {
        cb(null, 'uploaded_outreach_data.json') // Consistent filename
    }
});
const upload = multer({ storage: storage });

function addLog(message, level = "info") {
    const logOrigin = message.includes("[BOT_WORKER]") ? "" : `[SERVER] `;
    const logEntry = `${logOrigin}${message}`;
    botLogs.push(logEntry);
    if (botLogs.length > MAX_LOG_LINES) {
        botLogs = botLogs.slice(-MAX_LOG_LINES);
    }
    if (level === "error") console.error(logEntry);
    else if (level === "warn") console.warn(logEntry);
    else console.log(logEntry);
}

function startBot(geminiApiKeyFromForm, outreachFilePath) {
    if (botProcess) {
        addLog("Bot is already running.", "warn");
        return;
    }
    addLog("Forking bot worker process...");
    botLogs = [`[INFO] ${new Date().toISOString()} [SERVER] Bot starting...`];
    sseClients.forEach(client => client.res.write('event: start\ndata: Bot is starting...\n\n'));


    const botWorkerConfig = {
        geminiApiKey: geminiApiKeyFromForm,
        // These paths are now aligned with your Python script's file names
        outreachDataFile: outreachFilePath, // This is uploads/uploaded_outreach_data.json
        messagedContactsFile: path.join(DATA_FOLDER, "messaged_contacts.txt"),
        chatHistoryBaseFolder: path.join(DATA_FOLDER, "whatsapp_chats"),
        imageBaseFolder: path.join(DATA_FOLDER, "whatsapp_images"),
        userDataDir: CHROME_USER_DATA_FOLDER
        // Other configs (headless, timeouts) are read from .env by bot_worker.js
    };

    botProcess = fork(path.join(APP_DIR, 'bot_worker.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    botProcess.on('message', (msg) => {
        if (msg.type === 'log') {
            addLog(msg.message, msg.level);
        } else if (msg.type === 'ready') {
            addLog("Bot worker is ready. Sending start command with config.", "info");
            botProcess.send({ type: 'start', config: botWorkerConfig });
        } else if (msg.type === 'finished') {
            addLog("Bot worker reported it has finished.", "info");
            if (botProcess) botProcess.kill();
            botProcess = null;
            sseClients.forEach(client => client.res.write('event: end\ndata: Bot stopped or finished.\n\n'));
        } else if (msg.type === 'error') {
             addLog(`Bot worker reported a critical error: ${msg.message}`, "error");
             if (botProcess) botProcess.kill();
             botProcess = null;
             sseClients.forEach(client => client.res.write('event: error\ndata: Bot encountered an error.\n\n'));
        } else if (msg.type === 'live_view_frame') {
            sseClients.forEach(client => {
                client.res.write(`event: frame\ndata: ${msg.data}\n\n`);
            });
        }
    });

    botProcess.stdout.on('data', (data) => data.toString().trim().split('\n').forEach(line => addLog(`[BOT_STDOUT] ${line}`)));
    botProcess.stderr.on('data', (data) => data.toString().trim().split('\n').forEach(line => addLog(`[BOT_STDERR] ${line}`, "error")));

    botProcess.on('exit', (code, signal) => {
        const exitMsg = signal ? `killed by signal: ${signal}` : `exited with code ${code}`;
        addLog(`Bot worker process ${exitMsg}.`, signal || code !== 0 ? "warn" : "info");
        botProcess = null;
        sseClients.forEach(client => client.res.write('event: end\ndata: Bot process exited.\n\n'));
    });
    botProcess.on('error', (err) => {
        addLog(`Failed to start/manage bot worker process: ${err.message}`, "error");
        botProcess = null;
        sseClients.forEach(client => client.res.write('event: error\ndata: Failed to start bot.\n\n'));
    });
}

function stopBot() {
    if (botProcess) {
        addLog("Sending stop signal to bot worker...", "info");
        botProcess.send({ type: 'stop' });
        setTimeout(() => {
            if (botProcess && !botProcess.killed) {
                addLog("Bot worker did not exit gracefully after 15s, forcefully killing.", "warn");
                botProcess.kill('SIGTERM');
                botProcess = null;
            }
        }, 15000);
    } else {
        addLog("Bot is not running.", "warn");
    }
}

// --- Routes ---
app.get('/', (req, res) => {
    const botStatus = botProcess ? "Running" : "Not Running";
    res.render('index', { botStatus, currentApiKey: currentGeminiApiKey, logs: botLogs });
});

app.post('/control', upload.single('outreach_file'), async (req, res) => {
    const { action, gemini_api_key } = req.body;
    currentGeminiApiKey = gemini_api_key;

    if (action === 'start') {
        if (!gemini_api_key || gemini_api_key === "YOUR_GOOGLE_API_KEY" || !gemini_api_key.startsWith("AIzaSy")) {
            addLog("Error: Gemini API Key is missing, placeholder, or invalid format.", "error");
            return res.redirect('/');
        }

        let outreachFilePath = path.join(UPLOAD_FOLDER, 'uploaded_outreach_data.json'); // Your Python script's OUTREACH_DATA_FILE
        if (!req.file) {
            try {
                await fs.access(outreachFilePath);
                addLog("No new outreach file uploaded, using existing one if present.", "info");
            } catch (error) {
                addLog("No outreach file uploaded and default does not exist. Creating empty default.", "warn");
                await fs.writeFile(outreachFilePath, JSON.stringify([]), 'utf-8'); // Create empty JSON array
            }
        } else {
            addLog(`Outreach file uploaded and saved as uploaded_outreach_data.json`);
        }
        startBot(gemini_api_key, outreachFilePath);

    } else if (action === 'stop') {
        stopBot();
    } else if (action === 'clear_user_data') {
        if (botProcess) {
            addLog("Cannot clear user data while bot is running. Please stop the bot first.", "warn");
        } else {
            addLog("Clearing WhatsApp user data directory: " + CHROME_USER_DATA_FOLDER, "info");
            try {
                await rimraf(CHROME_USER_DATA_FOLDER); // Use rimraf for robust deletion
                await fs.mkdir(CHROME_USER_DATA_FOLDER, { recursive: true }); // Recreate empty dir
                addLog("WhatsApp user data directory cleared successfully. Bot will require QR scan on next start.", "info");
            } catch (err) {
                addLog(`Error clearing user data directory: ${err.message}`, "error");
            }
        }
    }
    res.redirect('/');
});

app.get('/logs', (req, res) => {
    res.json({ logs: botLogs });
});

app.get('/live-view-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res: res };
    sseClients.push(newClient);
    addLog(`Live view client connected: ${clientId}`, "info");

    if (botProcess) {
        res.write('event: start\ndata: Bot is running, attempting to stream view...\n\n');
    } else {
        res.write('event: end\ndata: Bot is not running.\n\n');
    }

    req.on('close', () => {
        addLog(`Live view client disconnected: ${clientId}`, "info");
        sseClients = sseClients.filter(client => client.id !== clientId);
        res.end();
    });
});

function gracefulShutdown() {
    addLog('SIGINT/SIGTERM received. Shutting down server and attempting to stop bot...', "warn");
    if (botProcess) {
        addLog("Sending stop to bot process before exiting server...", "info");
        botProcess.send({ type: 'stop' });
        const timeout = setTimeout(() => {
            if (botProcess && !botProcess.killed) {
                addLog("Force killing bot process as server shuts down.", "warn");
                botProcess.kill('SIGTERM');
            }
            process.exit(0);
        }, 10000);
        botProcess.on('exit', () => { clearTimeout(timeout); process.exit(0); });
    } else {
        process.exit(0);
    }
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

app.listen(port, '0.0.0.0', () => {
    addLog(`Server running at http://localhost:${port} or http://<your-ip>:${port}`);
    addLog(`API Key will be read from .env file (GEMINI_API_KEY) or taken from UI.`);
    addLog(`Puppeteer headless mode set to: ${process.env.PUPPETEER_HEADLESS_MODE || '"new" (default)'}`);
});