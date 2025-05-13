// server.js
require('dotenv').config(); // Load .env file
const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const rimraf = require('rimraf'); // For recursively deleting user data dir

const app = express();
const port = process.env.PORT || 5002;

const APP_DIR = __dirname;
const UPLOAD_FOLDER = path.join(APP_DIR, 'uploads');
const DATA_FOLDER = path.join(APP_DIR, 'data'); // For messaged_contacts, chat_history, images
const CHROME_USER_DATA_FOLDER = path.join(APP_DIR, 'chrome_user_data_puppeteer'); // For bot_core

// Ensure directories exist
(async () => {
    try {
        await fs.mkdir(UPLOAD_FOLDER, { recursive: true });
        await fs.mkdir(DATA_FOLDER, { recursive: true });
        await fs.mkdir(CHROME_USER_DATA_FOLDER, { recursive: true });
        await fs.mkdir(path.join(DATA_FOLDER, "whatsapp_chats"), { recursive: true });
        await fs.mkdir(path.join(DATA_FOLDER, "whatsapp_images"), { recursive: true });
        console.log("Required directories ensured/created.");
    } catch (err) {
        console.error("Error creating directories:", err);
    }
})();


app.set('view engine', 'ejs');
app.set('views', path.join(APP_DIR, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public'))); // For CSS/JS if any

// --- Bot Process Management ---
let botProcess = null;
let botLogs = [];
const MAX_LOG_LINES = 500; // Increased log buffer
let currentGeminiApiKey = process.env.GEMINI_API_KEY || "";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_FOLDER)
    },
    filename: function (req, file, cb) {
        // Always overwrite with this name to simplify logic
        cb(null, 'uploaded_outreach_data.json')
    }
});
const upload = multer({ storage: storage });


function addLog(message, level = "info") {
    const timestamp = new Date().toISOString();
    // Distinguish server logs from bot logs
    const logOrigin = message.includes("[BOT_WORKER]") ? "" : "[SERVER] ";
    const logEntry = `${logOrigin}${message}`; // Bot worker already includes its own timestamp and level
    botLogs.push(logEntry);
    if (botLogs.length > MAX_LOG_LINES) {
        botLogs = botLogs.slice(-MAX_LOG_LINES);
    }
    // Also log to server console
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
    botLogs = [`[INFO] ${new Date().toISOString()} [SERVER] Bot starting...`]; // Reset logs for new run

    // Pass necessary config to the bot worker
    // The worker will also try to load from its own .env for some defaults
    const botWorkerConfig = {
        geminiApiKey: geminiApiKeyFromForm, // Prioritize key from form
        outreachDataFile: outreachFilePath,
        messagedContactsFile: path.join(DATA_FOLDER, "messaged_contacts.txt"),
        chatHistoryBaseFolder: path.join(DATA_FOLDER, "whatsapp_chats"),
        imageBaseFolder: path.join(DATA_FOLDER, "whatsapp_images"),
        userDataDir: CHROME_USER_DATA_FOLDER
        // Other configs like headless mode, timeouts are read from .env by bot_worker.js
    };

    botProcess = fork(path.join(APP_DIR, 'bot_worker.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    botProcess.on('message', (msg) => {
        if (msg.type === 'log') {
            addLog(msg.message, msg.level); // Bot worker sends pre-formatted log
        } else if (msg.type === 'ready') {
            addLog("Bot worker is ready. Sending start command with config.", "info");
            botProcess.send({ type: 'start', config: botWorkerConfig });
        } else if (msg.type === 'finished') {
            addLog("Bot worker reported it has finished.", "info");
            if (botProcess) botProcess.kill();
            botProcess = null;
        } else if (msg.type === 'error') {
             addLog(`Bot worker reported a critical error: ${msg.message}`, "error");
             if (botProcess) botProcess.kill();
             botProcess = null;
        }
    });

    botProcess.stdout.on('data', (data) => {
        // These are raw stdout from bot, less common if IPC logging is used well
        data.toString().trim().split('\n').forEach(line => addLog(`[BOT_STDOUT] ${line}`));
    });
    botProcess.stderr.on('data', (data) => {
        data.toString().trim().split('\n').forEach(line => addLog(`[BOT_STDERR] ${line}`, "error"));
    });

    botProcess.on('exit', (code, signal) => {
        if (signal) {
            addLog(`Bot worker process was killed by signal: ${signal}.`, "warn");
        } else {
            addLog(`Bot worker process exited with code ${code}.`, code === 0 ? "info" : "warn");
        }
        botProcess = null;
    });
    botProcess.on('error', (err) => {
        addLog(`Failed to start/manage bot worker process: ${err.message}`, "error");
        botProcess = null;
    });
}

function stopBot() {
    if (botProcess) {
        addLog("Sending stop signal to bot worker...", "info");
        botProcess.send({ type: 'stop' });
        // Give it a moment to shut down gracefully
        setTimeout(() => {
            if (botProcess && !botProcess.killed) {
                addLog("Bot worker did not exit gracefully after 15s, forcefully killing.", "warn");
                botProcess.kill('SIGTERM');
                botProcess = null; // Ensure it's cleared
            }
        }, 15000); // 15 seconds grace period
    } else {
        addLog("Bot is not running.", "warn");
    }
}

// --- Routes ---
app.get('/', (req, res) => {
    const botStatus = botProcess ? "Running" : "Not Running";
    // Pass the current API key (from env or last form submission) to prefill the form
    res.render('index', { botStatus, currentApiKey: currentGeminiApiKey, logs: botLogs });
});

app.post('/control', upload.single('outreach_file'), async (req, res) => {
    const { action, gemini_api_key } = req.body;
    currentGeminiApiKey = gemini_api_key; // Store for UI prefill

    if (action === 'start') {
        if (!gemini_api_key || gemini_api_key.includes("YOUR_GOOGLE_API_KEY")) { // Basic check
            addLog("Error: Gemini API Key is missing or is a placeholder.", "error");
            req.flash('error', 'Gemini API Key is missing or invalid.'); // If using flash messages
            return res.redirect('/');
        }

        let outreachFilePath = path.join(UPLOAD_FOLDER, 'uploaded_outreach_data.json');
        if (!req.file) {
            try {
                // Check if the default outreach file exists
                await fs.access(outreachFilePath);
                addLog("No new outreach file uploaded, using existing one.", "info");
            } catch (error) {
                addLog("No outreach file uploaded and default does not exist. Creating empty default.", "warn");
                await fs.writeFile(outreachFilePath, JSON.stringify([]), 'utf-8');
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
            addLog("Clearing WhatsApp user data directory...", "info");
            try {
                // Using rimraf for robust recursive deletion
                await new Promise((resolve, reject) => {
                    rimraf(CHROME_USER_DATA_FOLDER, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
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
    res.json({ logs: botLogs }); // Send current logs buffer
});

// Graceful shutdown for the server
function gracefulShutdown() {
    addLog('SIGINT/SIGTERM received. Shutting down server and attempting to stop bot...', "warn");
    if (botProcess) {
        addLog("Sending stop to bot process before exiting server...", "info");
        botProcess.send({ type: 'stop' });
        // Wait a bit for bot to attempt cleanup
        const timeout = setTimeout(() => {
            if (botProcess && !botProcess.killed) {
                addLog("Force killing bot process as server shuts down.", "warn");
                botProcess.kill('SIGTERM');
            }
            process.exit(0);
        }, 10000); // Give bot 10s
        botProcess.on('exit', () => { // If bot exits earlier
            clearTimeout(timeout);
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

app.listen(port, '0.0.0.0', () => {
    addLog(`Server running at http://localhost:${port} or http://<your-ip>:${port}`);
    addLog(`Ensure Chrome/Chromium is installed if running on a server without it.`);
    addLog(`API Key will be read from .env file (GEMINI_API_KEY) or taken from UI.`);
});