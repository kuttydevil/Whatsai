// bot_worker.js
const path = require('path'); // <<<<<<<<<<<<<<<<<<< ADD THIS LINE FIRST
require('dotenv').config({ path: path.join(__dirname, '.env') }); // Now 'path' is defined

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const fs = require('fs').promises;
// const path = require('path'); // Already required above
const { randomInt } = require('crypto');

// --- Global Config (will be merged with passed config) ---
let BOT_CONFIG = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    headlessMode: process.env.PUPPETEER_HEADLESS_MODE === 'false' ? false : (process.env.PUPPETEER_HEADLESS_MODE || "new"),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT) || 90000,
    operationTimeout: parseInt(process.env.OPERATION_TIMEOUT) || 15000,
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    fastCheckIntervalS: parseInt(process.env.FAST_CHECK_INTERVAL_S) || 10,
    slowCheckIntervalS: parseInt(process.env.SLOW_CHECK_INTERVAL_S) || 30,
    maxFastChecksNoActivity: parseInt(process.env.MAX_FAST_CHECKS_NO_ACTIVITY) || 7,
    outreachDataFile: '',
    messagedContactsFile: '',
    chatHistoryBaseFolder: '',
    imageBaseFolder: '',
    userDataDir: '',
    stopSignal: false
};

// --- Prompts and Model Configs (Unchanged from your original script) ---
const system_prompt_reply = `You are Alex, Senior Solutions Architect at Flowtiva...`; // Your full prompt
const system_prompt_outreach = `Your name is Alex. You're a sharp, observant Solutions Architect at Flowtiva...`; // Your full prompt

const jayakrishnan_reply_model_config = { temperature: 0.9, topP: 0.9, topK: 50, maxOutputTokens: 1024 };
const outreach_model_config = { temperature: 0.9, topP: 0.9, topK: 50, maxOutputTokens: 300 };
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // Add other categories as needed
];

let jayakrishnan_reply_model;
let outreach_model;
let chat_history_training_data = []; // Initialized later

// --- Helper: Logging ---
function logMessage(message, level = "info") {
    const timestamp = new Date().toISOString();
    const logEntry = `[${level.toUpperCase()}] ${timestamp} [BOT_WORKER] ${message}`;
    if (process.send) {
        process.send({ type: 'log', level, message: logEntry });
    } else {
        console.log(logEntry);
    }
}

// --- Retry Helper ---
async function retryOperation(fn, operationName, maxAttempts = BOT_CONFIG.retryAttempts, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (BOT_CONFIG.stopSignal) {
            logMessage(`Stop signal received during retry for ${operationName}. Aborting.`, "warn");
            throw new Error("Operation aborted due to stop signal.");
        }
        try {
            return await fn();
        } catch (error) {
            logMessage(`Attempt ${attempt}/${maxAttempts} failed for ${operationName}: ${error.message}`, "warn");
            if (attempt === maxAttempts) {
                logMessage(`All ${maxAttempts} attempts failed for ${operationName}.`, "error");
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff basic
        }
    }
}


// --- Helper Functions (saveJson, loadJson, cleanPhoneNumber - largely same, added logging) ---
async function saveJson(data, filename) { /* ... (same as before, ensure logMessage is used) ... */
    try {
        const dirName = path.dirname(filename);
        await fs.mkdir(dirName, { recursive: true });
        await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        logMessage(`Error saving JSON to ${filename}: ${e.message}`, "error");
        return false;
    }
}
async function loadJson(filename) { /* ... (same as before, ensure logMessage is used) ... */
    try {
        const stats = await fs.stat(filename).catch(() => null);
        if (!stats || !stats.isFile()) {
            logMessage(`File not found or not a file: ${filename}`, "debug");
            return null;
        }
        const content = await fs.readFile(filename, 'utf-8');
        if (!content.trim()) {
            logMessage(`File is empty: ${filename}`, "debug");
            return null;
        }
        return JSON.parse(content);
    } catch (e) {
        logMessage(`Error loading JSON from ${filename}: ${e.message}. Returning null.`, "error");
        return null;
    }
}
function cleanPhoneNumber(phone) { /* ... (same as before) ... */
    if (!phone) return null;
    let phoneStr = String(phone).trim();
    if (phoneStr.startsWith('+')) phoneStr = phoneStr.substring(1);
    else if (phoneStr.startsWith('00')) phoneStr = phoneStr.substring(2);
    return phoneStr.replace(/\D/g, '');
}


// --- Puppeteer Specific Helpers (Updated for robustness) ---
async function getContactNameWithXPath(page) {
    const contactNameXPath = "//header//div[@role='button']//span[@dir='auto' and @title]";
    // WhatsApp UI changes, this is a common class for the contact name in header
    const fallbackXPath = "//header//span[contains(@class, 'selectable-text') and @dir='auto' and @title]";
    const defaultName = "UnknownContact";

    try {
        return await retryOperation(async () => {
            let contactElement = await page.waitForXPath(contactNameXPath, { timeout: BOT_CONFIG.operationTimeout / 2, visible: true }).catch(() => null);
            if (contactElement) {
                let name = await page.evaluate(el => el.getAttribute('title'), contactElement);
                await contactElement.dispose();
                if (name?.trim()) return name.trim();
            }
            contactElement = await page.waitForXPath(fallbackXPath, { timeout: BOT_CONFIG.operationTimeout / 2, visible: true }).catch(() => null);
            if (contactElement) {
                let name = await page.evaluate(el => el.getAttribute('title') || el.textContent, contactElement);
                await contactElement.dispose();
                if (name?.trim()) return name.trim();
            }
            throw new Error("Contact name element not found with primary or fallback XPath.");
        }, "getContactNameWithXPath");
    } catch (e) {
        logMessage(`Could not get contact name: ${e.message}`, "warn");
        return defaultName;
    }
}

async function checkAndClickUnreadXPath(page) {
    // This XPath targets the green dot indicating unread messages.
    // It might need adjustment if WhatsApp changes its UI.
    const xpathUnreadItem = "//span[@data-testid='icon-unread-count']/ancestor::div[@role='listitem'][1]";
    try {
        const unreadChatElementHandle = await page.waitForXPath(xpathUnreadItem, { timeout: 3000, visible: true }); // Shorter timeout, it's a quick check
        if (unreadChatElementHandle) {
            logMessage("Unread chat indicator found. Clicking.", "debug");
            await page.waitForTimeout(randomInt(300, 700));
            await unreadChatElementHandle.click();
            await unreadChatElementHandle.dispose();
            return true;
        }
    } catch (e) { /* Not found is okay, means no unread with this specific selector */ }
    return false;
}

async function getImageBase64FromBlobUrl(page, blobUrl) { /* ... (same as before, ensure logMessage is used) ... */
    logMessage(`Attempting to fetch blob URL via page.evaluate: ${blobUrl.substring(0, 50)}...`, "debug");
    if (!blobUrl.startsWith("blob:")) {
        logMessage("Error: Provided URL is not a blob URL.", "error");
        return { base64Data: null, mimeType: null };
    }
    try {
        const dataUrl = await page.evaluate(async (url) => { /* ... (your existing evaluate script) ... */
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`[Page Context] Failed to fetch blob: ${response.status} ${response.statusText}`);
                    return null;
                }
                const blob = await response.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = (error) => {
                        console.error('[Page Context] FileReader error:', error);
                        reject(error);
                    };
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error('[Page Context] Error fetching or reading blob in evaluate:', e);
                return null;
            }
        }, blobUrl);

        if (dataUrl && dataUrl.startsWith('data:image')) {
            const [header, encoded] = dataUrl.split(',', 2);
            const mimeType = header.split(';')[0].split(':')[1];
            logMessage(`Successfully fetched blob and got base64 (Mime Type: ${mimeType})`, "debug");
            return { base64Data: encoded, mimeType };
        } else if (dataUrl === null) {
            logMessage("Error: page.evaluate for blob fetch returned null (check browser console for details).", "error");
        } else {
            logMessage(`Error: page.evaluate returned unexpected data for blob: ${String(dataUrl).substring(0,100)}...`, "error");
        }
    } catch (e) {
        logMessage(`Unexpected error getting image base64 from blob: ${e.message}`, "error");
    }
    return { base64Data: null, mimeType: null };
}

async function saveImageFromBase64(base64Data, mimeType, contactName) { /* ... (same as before, ensure logMessage is used) ... */
    try {
        await fs.mkdir(BOT_CONFIG.imageBaseFolder, { recursive: true });
        const safeContactName = contactName.replace(/[^a-zA-Z0-9_.-]/g, "_"); // Allow dots and hyphens
        const contactFolder = path.join(BOT_CONFIG.imageBaseFolder, safeContactName);
        await fs.mkdir(contactFolder, { recursive: true });

        const imageBuffer = Buffer.from(base64Data, 'base64');
        let extension = mimeType.split('/')[1] || 'png';
        if (extension === 'jpeg') extension = 'jpg';
        if (extension.includes('+')) extension = extension.split('+')[0]; // Handle things like image/svg+xml

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, -4);
        const filename = `image_${timestamp}_${randomInt(100,999)}.${extension}`; // Add random to avoid rare collisions
        const filepath = path.join(contactFolder, filename);

        await fs.writeFile(filepath, imageBuffer);
        logMessage(`Image saved successfully to: ${filepath}`);
        return { filepath, imageBuffer };
    } catch (e) {
        logMessage(`Unexpected error saving image: ${e.message}`, "error");
        return { filepath: null, imageBuffer: null };
    }
}

function filterScrapedText(text) { /* ... (same as before) ... */
    if (!text || !text.trim()) return null;
    text = text.trim();
    const junkPatterns = [
        /^\d{1,2}:\d{2}\s+(AM|PM)$/i, /^\[\d{1,2}:\d{2},\s+\d{1,2}\/\d{1,2}\/\d{4}\]/i, // Timestamps
        /^tail-in$/i, /^forward-chat$/i, /^Select message$/i, /^typing…$/i,
        /^You replied to/i, /^You reacted/i, /^You forwarded/i, /^You deleted/i,
        /^\d+\s+(unread message|unread messages)$/i
    ];
    for (const pattern of junkPatterns) {
        if (pattern.test(text)) return null;
    }
    // Remove zero-width spaces and other non-printables that can mess up comparisons
    return text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

async function typeLikeHuman(elementHandleOrPage, text, wpm = 200) { // Slightly slower default
    if (!text) return;
    const delayPerCharMs = (60 / (wpm * 5)) * 1000;
    for (const char of text) {
        if (BOT_CONFIG.stopSignal) break;
        const currentDelay = randomInt(delayPerCharMs * 0.7, delayPerCharMs * 1.3);
        if (elementHandleOrPage.type) { // It's an ElementHandle
            await elementHandleOrPage.type(char, { delay: currentDelay });
        } else { // It's the Page object (for page.keyboard.type)
            await elementHandleOrPage.keyboard.type(char, { delay: currentDelay });
        }
    }
}

async function loadOutreachData() { /* ... (same as before, ensure logMessage is used) ... */
    logMessage(`Loading outreach data from ${BOT_CONFIG.outreachDataFile}...`);
    const data = await loadJson(BOT_CONFIG.outreachDataFile);
    if (!data || !Array.isArray(data)) {
        logMessage(`Warning: Outreach file ${BOT_CONFIG.outreachDataFile} not found or invalid. Using empty list.`, "warn");
        return [];
    }
    logMessage(`Loaded ${data.length} outreach contacts.`);
    return data;
}
async function loadMessagedContacts() { /* ... (same as before, ensure logMessage is used) ... */
    const messaged = new Set();
    try {
        const stats = await fs.stat(BOT_CONFIG.messagedContactsFile).catch(() => null);
        if (!stats || !stats.isFile()) {
             logMessage(`Messaged contacts file ${BOT_CONFIG.messagedContactsFile} not found. Starting fresh.`);
             return messaged;
        }
        const content = await fs.readFile(BOT_CONFIG.messagedContactsFile, 'utf-8');
        content.split('\n').forEach(line => {
            const cleanedLine = line.trim();
            if (cleanedLine) messaged.add(cleanedLine);
        });
        logMessage(`Loaded ${messaged.size} previously messaged contacts from ${BOT_CONFIG.messagedContactsFile}.`);
    } catch (e) {
        logMessage(`Error reading messaged contacts file ${BOT_CONFIG.messagedContactsFile}: ${e.message}`, "error");
    }
    return messaged;
}
async function addMessagedContact(phoneNumber) { /* ... (same as before, ensure logMessage is used) ... */
    try {
        const dirName = path.dirname(BOT_CONFIG.messagedContactsFile);
        await fs.mkdir(dirName, { recursive: true });
        await fs.appendFile(BOT_CONFIG.messagedContactsFile, phoneNumber + '\n', 'utf-8');
        logMessage(`Added ${phoneNumber} to messaged contacts file.`);
        return true;
    } catch (e) {
        logMessage(`Error writing to messaged contacts file: ${e.message}`, "error");
        return false;
    }
}

async function generateOutreachMessage(contactData) { /* ... (same as before, ensure logMessage is used) ... */
    logMessage(`Generating outreach message for: ${contactData.title || 'N/A'}`);
    try {
        const contextStr = JSON.stringify(contactData);
        const response = await outreach_model.generateContent(contextStr);
        const message = response.response.text().trim();
        if (!message || message.length < 10) {
            logMessage("Warning: AI generated a very short or empty outreach message.", "warn");
            return `Hi, I saw your ad for ${contactData.title || 'your item/service'}. Alex (Flowtiva) - we automate that. Open to a quick chat?`;
        }
        logMessage(`Generated outreach message:\n${message}`);
        return message;
    } catch (ai_err) {
        logMessage(`ERROR during AI outreach message generation: ${ai_err.message}`, "error");
        if (ai_err.response && ai_err.response.promptFeedback) logMessage(`    Prompt Feedback: ${JSON.stringify(ai_err.response.promptFeedback)}`, "error");
        return `Hi, I saw your ad for ${contactData.title || 'your item/service'}. Alex (Flowtiva) - we automate that. Open to a quick chat?`;
    }
}

async function performOutreachTask(page, outreachData, messagedContacts) {
    logMessage("\n--- Attempting Outreach Task ---");
    let contactMessagedThisCycle = false;
    for (const contact of outreachData) {
        if (BOT_CONFIG.stopSignal) break;
        const rawPhone = contact.whatsapp || contact.phone;
        if (!rawPhone) continue;
        const cleanedPhone = cleanPhoneNumber(rawPhone);
        if (!cleanedPhone) { logMessage(`Skipping contact (invalid phone format): ${rawPhone}`); continue; }
        if (messagedContacts.has(cleanedPhone)) continue;

        logMessage(`Found new contact for outreach: ${cleanedPhone} (${contact.title || 'N/A'})`);
        try {
            await retryOperation(async () => {
                // Click "New Chat"
                // More robust selector for New Chat button (often has a title or specific data-testid)
                const newChatButtonSelectors = [
                    "div[title='New chat']", // Common
                    "span[data-icon='new-chat-outline']", // Old selector
                    "button[aria-label='New chat']"
                ];
                let newChatButton;
                for (const selector of newChatButtonSelectors) {
                    newChatButton = await page.$(selector);
                    if (newChatButton) break;
                }
                if (!newChatButton) throw new Error("New Chat button not found with any selector.");
                await newChatButton.click();
                await newChatButton.dispose();
                await page.waitForTimeout(randomInt(1500, 2500));

                // Search for number
                // Selector for search box in "New Chat" pane
                const searchBoxSelector = "div[aria-label='Search input textbox'][contenteditable='true']";
                const searchBox = await page.waitForSelector(searchBoxSelector, { visible: true, timeout: BOT_CONFIG.operationTimeout });
                await searchBox.click({ clickCount: 3 }); // Select all
                await searchBox.press('Backspace'); // Clear
                await typeLikeHuman(searchBox, cleanedPhone);
                await page.waitForTimeout(randomInt(1500, 2500)); // Wait for search results

                // Confirm contact or handle "not found"
                // This is the trickiest part due to dynamic loading and UI variations.
                // Look for an element that uniquely identifies the searched contact in the results list.
                // Or look for a "No results found" message.
                const contactResultXPath = `//div[@role='listitem']//span[@title='${cleanedPhone}' or normalize-space(text())='${cleanedPhone}']`;
                const noResultsXPath = "//div[contains(text(),'No chats, contacts or messages found') or contains(text(), 'No results found')]";

                const contactElementHandle = await page.waitForXPath(contactResultXPath, { visible: true, timeout: 7000 }).catch(() => null);

                if (contactElementHandle) {
                    logMessage("Contact found in search results. Clicking.", "debug");
                    await contactElementHandle.click();
                    await contactElementHandle.dispose();
                    await page.waitForTimeout(randomInt(2000, 3000)); // Wait for chat to open

                    // Message box
                    const messageBoxSelector = "div[aria-label='Type a message'][contenteditable='true']";
                    const messageBoxHandle = await page.waitForSelector(messageBoxSelector, { visible: true, timeout: BOT_CONFIG.operationTimeout });

                    const outreachMessage = await generateOutreachMessage(contact);
                    if (!outreachMessage) { logMessage("Failed to generate outreach message. Skipping.", "error"); return; /* Skip this contact */ }

                    await messageBoxHandle.click({ clickCount: 3 });
                    await messageBoxHandle.press('Backspace');
                    await typeLikeHuman(messageBoxHandle, outreachMessage);
                    await page.keyboard.press('Enter');
                    logMessage("Outreach message sent successfully.");
                    await messageBoxHandle.dispose();

                    await page.waitForTimeout(randomInt(500, 1000));
                    logMessage("Reloading page after sending outreach...");
                    await page.reload({ waitUntil: 'networkidle0', timeout: BOT_CONFIG.pageLoadTimeout });
                    await page.waitForTimeout(randomInt(8000, 12000)); // Wait for full reload

                    if (await addMessagedContact(cleanedPhone)) {
                        messagedContacts.add(cleanedPhone);
                        contactMessagedThisCycle = true;
                    }
                } else {
                    const noResultsElement = await page.waitForXPath(noResultsXPath, { visible: true, timeout: 2000 }).catch(() => null);
                    if (noResultsElement) {
                        logMessage(`Contact number ${cleanedPhone} not found (No results message displayed).`);
                        await noResultsElement.dispose();
                    } else {
                        throw new Error(`Contact ${cleanedPhone} not found in results, and no 'No results' message detected.`);
                    }
                }
            }, `outreachTo_${cleanedPhone}`);

            if (contactMessagedThisCycle) break; // Process one contact per outreach cycle

        } catch (e_ui) {
            logMessage(`Error during outreach UI interaction for ${cleanedPhone}: ${e_ui.message}`, "error");
            // Attempt to close the "new chat" panel to recover
            const closeButtonSelectors = ["span[data-icon='x-alt']", "button[aria-label='Close']", "button[aria-label='Back']"];
            for (const selector of closeButtonSelectors) {
                try {
                    const closeBtn = await page.$(selector);
                    if (closeBtn) {
                        logMessage("Attempting to close 'New Chat' panel after error...", "debug");
                        await closeBtn.click(); await closeBtn.dispose();
                        await page.waitForTimeout(1000); break;
                    }
                } catch (closeErr) { /* ignore */ }
            }
        }
        if (contactMessagedThisCycle) break;
    }
    if (!contactMessagedThisCycle) logMessage("No new contacts found or processed in this outreach cycle.");
    logMessage("--- Finished Outreach Task Attempt ---");
    return contactMessagedThisCycle;
}

// --- Attempt to handle common popups ---
async function handleCommonPopups(page) {
    const popups = [
        { // "WhatsApp is open on another computer or browser"
            triggerText: "WhatsApp is open on another computer",
            buttonText: "Use Here", // Or "LOG OUT"
            action: "clickButton"
        },
        { // Storage almost full
            triggerText: "Storage almost full",
            buttonText: "OK", // Or "FREE UP SPACE"
            action: "clickButton"
        },
        // Add more known popups here
    ];

    for (const popup of popups) {
        if (BOT_CONFIG.stopSignal) return;
        try {
            const bodyText = await page.evaluate(() => document.body.innerText);
            if (bodyText.includes(popup.triggerText)) {
                logMessage(`Detected potential popup: "${popup.triggerText}"`, "warn");
                // Try to find button by text content (more robust than specific selectors for popups)
                const buttonXPath = `//div[@role='button' or @role='dialog']//div[normalize-space()='${popup.buttonText}'] | //button[normalize-space()='${popup.buttonText}']`;
                const buttonHandle = await page.waitForXPath(buttonXPath, { visible: true, timeout: 5000 }).catch(() => null);
                if (buttonHandle) {
                    logMessage(`Found button "${popup.buttonText}" for popup. Clicking.`, "info");
                    await buttonHandle.click();
                    await buttonHandle.dispose();
                    await page.waitForTimeout(randomInt(2000, 4000)); // Wait for popup to dismiss
                    return true; // Popup handled
                } else {
                    logMessage(`Could not find button "${popup.buttonText}" for popup "${popup.triggerText}".`, "warn");
                }
            }
        } catch (e) {
            logMessage(`Error while trying to handle popup "${popup.triggerText}": ${e.message}`, "warn");
        }
    }
    return false; // No relevant popup handled
}


// ---- Main Bot Logic (runBotAutomation) ----
async function runBotAutomation() {
    logMessage(`Bot automation starting with API Key: ${BOT_CONFIG.geminiApiKey ? BOT_CONFIG.geminiApiKey.slice(0,4) + '...' : 'NOT SET'}`);
    logMessage(`Headless mode: ${BOT_CONFIG.headlessMode}`);

    if (!BOT_CONFIG.geminiApiKey || BOT_CONFIG.geminiApiKey.includes("YOUR_GOOGLE_API_KEY")) {
        logMessage("ERROR: Google Gemini API key is missing or placeholder.", "error");
        return; // Exit if no valid key
    }

    try {
        const genAI = new GoogleGenerativeAI(BOT_CONFIG.geminiApiKey);
        jayakrishnan_reply_model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: system_prompt_reply, generationConfig: jayakrishnan_reply_model_config, safetySettings });
        outreach_model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: system_prompt_outreach, generationConfig: outreach_model_config, safetySettings });
        chat_history_training_data = [
            { role: "user", parts: [{ text: system_prompt_reply }] },
            { role: "model", parts: [{ text: "Okay, I'm ready. Give me the client's message." }] }
        ];
        logMessage("Testing Gemini connection...");
        const testResponse = await jayakrishnan_reply_model.generateContent("Hello, test connection.");
        logMessage(`Gemini test response (Reply Model): ${testResponse.response.text().substring(0,50)}...`);
        logMessage("Gemini models configured successfully.");
    } catch (gemini_config_e) {
        logMessage(`ERROR: Failed to configure Google Gemini AI: ${gemini_config_e.message}`, "error");
        if (gemini_config_e.message.includes('API key not valid')) {
            logMessage("Please check your GEMINI_API_KEY in the .env file or UI.", "error");
        }
        return;
    }

    let browser;
    try {
        logMessage("Launching Puppeteer browser...");
        browser = await puppeteer.launch({
            headless: BOT_CONFIG.headlessMode,
            executablePath: BOT_CONFIG.executablePath || undefined, // Let Puppeteer find it if not specified
            userDataDir: BOT_CONFIG.userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                // '--single-process', // Might be useful in resource-constrained environments, but can be less stable
                '--disable-gpu',
                '--window-size=1366,768' // Consistent window size
            ]
        });
        const page = (await browser.pages())[0] || await browser.newPage(); // Use existing page or create new
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"); // Keep UA updated
        await page.setViewport({ width: 1366, height: 768 });
        page.setDefaultNavigationTimeout(BOT_CONFIG.pageLoadTimeout);
        page.setDefaultTimeout(BOT_CONFIG.operationTimeout);


        logMessage("Navigating to WhatsApp Web...");
        await retryOperation(async () => {
            await page.goto("https://web.whatsapp.com/", { waitUntil: 'networkidle0' });
        }, "NavigateToWhatsApp");


        let loggedIn = false;
        try {
            // More robust check for login: wait for the main chat list or the QR code pane
            // Selector for QR code area (if not logged in)
            const qrCodeSelector = "div[data-testid='qrcode']";
            // Selector for chat list (if logged in)
            const chatListSelector = "div[aria-label='Chat list'], div[data-testid='chat-list']"; // Try common testids

            logMessage("Waiting for login state (QR code or Chat list)... Max 60s.");
            await page.waitForFunction(
                (qrSel, listSel) => document.querySelector(qrSel) || document.querySelector(listSel),
                { timeout: 60000 }, // Increased timeout for manual QR scan
                qrCodeSelector, chatListSelector
            );

            if (await page.$(chatListSelector)) {
                logMessage("WhatsApp Logged in (found chat list).");
                loggedIn = true;
            } else if (await page.$(qrCodeSelector)) {
                logMessage("WhatsApp not logged in (QR code visible). Please scan the QR code.", "warn");
                if (BOT_CONFIG.headlessMode !== false && BOT_CONFIG.headlessMode !== "new") { // "new" is headless
                     logMessage("Hint: Run with PUPPETEER_HEADLESS_MODE=false in .env to see the browser window for QR scan.", "info");
                }
                // Wait for user to scan QR code, then check again for chat list
                await page.waitForSelector(chatListSelector, { timeout: 120000, visible: true }); // Wait up to 2 mins after QR
                logMessage("WhatsApp Logged in after QR scan (found chat list).");
                loggedIn = true;
            } else {
                 logMessage("Could not determine login state (neither QR code nor chat list found).", "error");
            }

        } catch (e) {
            logMessage(`Error during login check: ${e.message}`, "error");
            logMessage("If this is the first run or session expired, ensure you can scan the QR code.", "error");
        }

        if (loggedIn) {
            logMessage("\n=========== STARTING MAIN CHECK LOOP ===========");
            let currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS;
            let fastCheckCount = 0;

            const outreachData = await loadOutreachData();
            const messagedContacts = await loadMessagedContacts();

            while (!BOT_CONFIG.stopSignal) {
                if (await handleCommonPopups(page)) { // Check for popups at start of cycle
                    logMessage("Handled a common popup, re-evaluating state...", "info");
                    await page.waitForTimeout(randomInt(2000, 4000)); // Give WA time to settle
                }

                logMessage(`\n--- Check Cycle Start (Interval: ${currentCheckIntervalS}s) ---`, "debug");
                let processedUnreadInCycle = false;
                let aiReplyGeneratedThisCycle = false;

                // INNER LOOP: Process *all* unread messages
                while (!BOT_CONFIG.stopSignal) {
                    const unreadClicked = await checkAndClickUnreadXPath(page);
                    if (unreadClicked) {
                        logMessage(">>> Unread chat clicked. Processing...");
                        processedUnreadInCycle = true;
                        fastCheckCount = 0; // Reset fast check counter
                        currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS; // Switch to fast check
                        await page.waitForTimeout(randomInt(2500, 4000)); // Wait for chat to load fully

                        const contactName = await getContactNameWithXPath(page);
                        if (!contactName || contactName === "UnknownContact") {
                            logMessage("WARNING: Could not get contact name. Skipping chat.", "warn");
                            await page.waitForTimeout(randomInt(2000,3000));
                            continue; // Try next unread if any
                        }

                        const safeContactName = contactName.replace(/[^a-zA-Z0-9_.-]/g, "_") || "unknown_contact";
                        const jsonFilenameThisChat = path.join(BOT_CONFIG.chatHistoryBaseFolder, `whatsapp_chat_${safeContactName}.json`);
                        logMessage(`Chat with: ${contactName} (File: ${jsonFilenameThisChat})`);

                        let existingChatHistory = await loadJson(jsonFilenameThisChat);
                        if (!existingChatHistory || !Array.isArray(existingChatHistory)) {
                            logMessage(`Initializing history for ${contactName}.`);
                            existingChatHistory = [...chat_history_training_data]; // Deep copy
                            await saveJson(existingChatHistory, jsonFilenameThisChat);
                        } else {
                            logMessage(`Loaded ${existingChatHistory.length} messages for ${contactName}.`);
                        }

                        // ---- SCRAPING LOGIC (using page.evaluate for efficiency) ----
                        logMessage("Scraping visible messages...", "debug");
                        let scrapedItems = [];
                        try {
                            // SELECTORS ARE CRITICAL AND FRAGILE - Adjust these based on current WhatsApp Web structure
                            // This evaluate function needs to be robust.
                            scrapedItems = await page.evaluate(() => {
                                const items = [];
                                // Main message container (might need adjustment)
                                const messagePane = document.querySelector("div[data-testid='conversation-panel-messages'] div[role='application']") || document.querySelector("div[data-tab='8']");
                                if (!messagePane) return items;

                                // Message bubbles (in or out)
                                const messageNodes = messagePane.querySelectorAll("div.message-in, div.message-out");

                                messageNodes.forEach(msgNode => {
                                    const role = msgNode.classList.contains('message-out') ? 'model' : 'user';
                                    let textContent = '';
                                    let imageSrc = null;
                                    let caption = '';

                                    // Image: Look for img tags with blob src
                                    const imgElement = msgNode.querySelector('img[src^="blob:"]');
                                    if (imgElement) imageSrc = imgElement.src;

                                    // Text: Common class for message text is often within 'copyable-text'
                                    // Or a span with specific classes. This is highly variable.
                                    // Prioritize more specific selectors if known.
                                    const textElements = msgNode.querySelectorAll('.copyable-text span._ao3e, .copyable-text span.selectable-text, div[data-testid="message-text"] span');
                                    if (textElements.length > 0) {
                                        textContent = Array.from(textElements).map(el => el.innerText).join('\n').trim();
                                    } else {
                                        // Fallback if specific spans not found, try broader copyable-text
                                        const copyableTextDiv = msgNode.querySelector('.copyable-text');
                                        if (copyableTextDiv) textContent = copyableTextDiv.innerText.trim();
                                    }

                                    // If image found, textContent might be its caption
                                    if (imageSrc && textContent) {
                                        caption = textContent;
                                        // Decide if textContent should be cleared if it's purely a caption
                                        // For now, keep it, Gemini can differentiate.
                                    }

                                    if (imageSrc) {
                                        items.push({ type: "image", role, imageSrc, caption });
                                    }
                                    // Add text only if it's not just a caption for an already added image,
                                    // OR if it's a standalone text message.
                                    if (textContent && !(imageSrc && caption === textContent && items.find(i => i.imageSrc === imageSrc))) {
                                         items.push({ type: "text", role, parts: [textContent] });
                                    }
                                });
                                return items;
                            });
                            logMessage(`Scraped ${scrapedItems.length} potential items from view for ${contactName}.`, "debug");

                        } catch (scrapeErr) {
                            logMessage(`ERROR during message scraping evaluate for ${contactName}: ${scrapeErr.message}`, "error");
                        }

                        // ---- Process Scraped Items and Update History ----
                        let newMessagesFoundCount = 0;
                        let latestUserImageForAI = null; // For AI call

                        if (scrapedItems.length > 0) {
                            const existingMessageContent = new Set(
                                existingChatHistory
                                    .filter(msg => msg.parts && Array.isArray(msg.parts) && typeof msg.parts[0]?.text === 'string')
                                    .map(msg => msg.parts[0].text)
                            );

                            for (const item of scrapedItems) {
                                if (BOT_CONFIG.stopSignal) break;
                                let historyEntry = null;
                                let isNew = false;

                                if (item.type === "image" && item.role === "user") {
                                    const { base64Data, mimeType } = await getImageBase64FromBlobUrl(page, item.imageSrc);
                                    if (base64Data && mimeType) {
                                        const { filepath, imageBuffer } = await saveImageFromBase64(base64Data, mimeType, contactName);
                                        if (filepath && imageBuffer) {
                                            latestUserImageForAI = { filepath, imageBuffer, mimeType, caption: filterScrapedText(item.caption) }; // Store for AI
                                            const placeholderText = `<Image received: ${path.basename(filepath)}>` + (latestUserImageForAI.caption ? ` Caption: ${latestUserImageForAI.caption}` : "");
                                            if (!existingMessageContent.has(placeholderText)) {
                                                historyEntry = { role: "user", parts: [{ text: placeholderText }] };
                                                isNew = true;
                                                existingMessageContent.add(placeholderText);
                                            }
                                        }
                                    }
                                } else if (item.type === "text") {
                                    const filteredText = filterScrapedText(item.parts[0]);
                                    if (filteredText && !existingMessageContent.has(filteredText)) {
                                        historyEntry = { role: item.role, parts: [{ text: filteredText }] };
                                        isNew = true;
                                        existingMessageContent.add(filteredText);
                                    }
                                }

                                if (isNew && historyEntry) {
                                    existingChatHistory.push(historyEntry);
                                    newMessagesFoundCount++;
                                }
                            }
                            logMessage(`Appended ${newMessagesFoundCount} new entries to history for ${contactName}.`);
                            if (newMessagesFoundCount > 0) {
                                await saveJson(existingChatHistory, jsonFilenameThisChat);
                            }
                        } else {
                            logMessage(`No processable items scraped for ${contactName}.`);
                        }

                        // ---- AI Reply Generation ----
                        // Only reply if new messages were from the user and added to history
                        if (existingChatHistory.length > 0 && newMessagesFoundCount > 0 && existingChatHistory[existingChatHistory.length -1].role === 'user') {
                            const lastUserEntry = existingChatHistory[existingChatHistory.length - 1];
                            let aiContentParts = []; // For Gemini API

                            // Prepare history for AI (last N messages, excluding system prompt if already part of history)
                            const historyForAIContext = existingChatHistory
                                .filter(msg => !(msg.role === 'user' && msg.parts[0]?.text === system_prompt_reply))
                                .slice(-15); // Context window

                            if (lastUserEntry.parts[0].text.startsWith("<Image received") && latestUserImageForAI) {
                                logMessage("Last user entry is new image. Preparing multimodal AI call.", "info");
                                aiContentParts.push({
                                    inlineData: {
                                        mimeType: latestUserImageForAI.mimeType,
                                        data: latestUserImageForAI.imageBuffer.toString('base64')
                                    }
                                });
                                const imagePromptText = latestUserImageForAI.caption ?
                                    `User sent this image with the caption: "${latestUserImageForAI.caption}". Describe the image and respond to the caption and conversation contextually.` :
                                    "User sent this image. Describe it briefly and respond contextually based on the conversation.";
                                aiContentParts.push({ text: imagePromptText });
                            } else if (!lastUserEntry.parts[0].text.startsWith("<Image received")) {
                                logMessage("Last user entry is text. Preparing text-only AI call.", "info");
                                aiContentParts.push({ text: lastUserEntry.parts[0].text });
                            }

                            if (aiContentParts.length > 0) {
                                aiReplyGeneratedThisCycle = true;
                                try {
                                    logMessage(`Sending to AI for ${contactName}. History length for context: ${historyForAIContext.length}, New content parts: ${aiContentParts.length}`, "debug");
                                    const chatSession = jayakrishnan_reply_model.startChat({ history: historyForAIContext });
                                    const result = await chatSession.sendMessage(aiContentParts);
                                    const aiReply = result.response.text().trim();

                                    if (aiReply) {
                                        logMessage(`\n>>> AI Reply for ${contactName}:\n${aiReply}\n`);
                                        // WhatsApp Web often splits messages by newline. Send line by line or replace newlines.
                                        // For simplicity, replace newlines with a space for single message sending.
                                        // For multi-line, you'd loop and send each line with page.keyboard.down('Shift'), page.keyboard.press('Enter'), page.keyboard.up('Shift')
                                        const aiReplyToSend = aiReply.replace(/\n+/g, " ");


                                        const messageBoxSelector = "div[aria-label='Type a message'][contenteditable='true']";
                                        const messageBoxHandle = await page.waitForSelector(messageBoxSelector, { visible: true, timeout: BOT_CONFIG.operationTimeout });

                                        await messageBoxHandle.click({ clickCount: 3 }); // Select all
                                        await messageBoxHandle.press('Backspace');    // Clear
                                        await typeLikeHuman(messageBoxHandle, aiReplyToSend);
                                        await page.keyboard.press('Enter');
                                        logMessage("Reply sent to " + contactName);
                                        await messageBoxHandle.dispose();

                                        await page.waitForTimeout(randomInt(500, 1000));
                                        logMessage("Reloading page after sending reply to ensure UI consistency...", "debug");
                                        await page.reload({ waitUntil: 'networkidle0', timeout: BOT_CONFIG.pageLoadTimeout });
                                        await page.waitForTimeout(randomInt(7000, 10000)); // Wait for full reload

                                        existingChatHistory.push({ role: "model", parts: [{ text: aiReplyToSend }] }); // Save the sent version
                                        await saveJson(existingChatHistory, jsonFilenameThisChat);
                                    } else {
                                        logMessage("AI generated an empty reply for " + contactName, "warn");
                                    }
                                } catch (ai_err) {
                                    logMessage(`ERROR during AI generation or sending for ${contactName}: ${ai_err.message}`, "error");
                                    if (ai_err.response && ai_err.response.promptFeedback) logMessage(`    Prompt Feedback: ${JSON.stringify(ai_err.response.promptFeedback)}`, "error");
                                }
                            }
                        }
                        logMessage(`--- Finished processing chat with ${contactName} ---`);
                        if (BOT_CONFIG.stopSignal) break;

                    } else { // No more unread chats with the current selector
                        break; // Exit the inner unread processing loop
                    }
                    if (BOT_CONFIG.stopSignal) break;
                } // End inner unread loop
                if (BOT_CONFIG.stopSignal) break;

                // Interval switching logic
                if (processedUnreadInCycle) {
                    currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS;
                    fastCheckCount = 0;
                } else {
                    if (currentCheckIntervalS === BOT_CONFIG.fastCheckIntervalS) {
                        fastCheckCount++;
                        logMessage(`No activity during fast check cycle ${fastCheckCount}/${BOT_CONFIG.maxFastChecksNoActivity}.`, "debug");
                        if (fastCheckCount >= BOT_CONFIG.maxFastChecksNoActivity) {
                            logMessage(`Switching to slow check interval (${BOT_CONFIG.slowCheckIntervalS}s) for outreach.`);
                            currentCheckIntervalS = BOT_CONFIG.slowCheckIntervalS;
                            fastCheckCount = 0;
                        }
                    }
                }
                if (BOT_CONFIG.stopSignal) break;

                // Perform Outreach Task
                if (currentCheckIntervalS === BOT_CONFIG.slowCheckIntervalS && !processedUnreadInCycle && !aiReplyGeneratedThisCycle) {
                     const currentOutreachData = await loadOutreachData(); // Reload in case of changes
                     if(currentOutreachData.length > 0){
                        await performOutreachTask(page, currentOutreachData, messagedContacts);
                     } else {
                        logMessage("Outreach data is empty or not found. Skipping outreach task this cycle.");
                     }
                }
                if (BOT_CONFIG.stopSignal) break;

                logMessage(`--- Check Cycle End. Waiting ${currentCheckIntervalS} seconds... ---`, "debug");
                for (let i = 0; i < currentCheckIntervalS; i++) { // Wait with stop check
                    if (BOT_CONFIG.stopSignal) break;
                    await page.waitForTimeout(1000);
                }
            } // End main while loop
        } // End if loggedIn
    } catch (error) {
        logMessage(`❌ FATAL Unhandled Error in Bot Automation: ${error.message}\n${error.stack}`, "error");
        if (process.send) process.send({ type: 'error', message: error.message });
    } finally {
        logMessage("--- Bot Automation Shutting Down ---");
        if (browser) {
            try {
                logMessage("Attempting to close browser...");
                await browser.close();
                logMessage("Browser closed.");
            } catch (e) {
                logMessage(`Error closing browser: ${e.message}`, "error");
            }
        }
        logMessage("--- Bot Automation Shutdown Complete ---");
        if (process.send) {
            process.send({ type: 'finished' }); // Notify parent
        }
    }
}


// --- Process messages from parent (server.js) ---
process.on('message', async (msg) => {
    if (msg.type === 'start') {
        // Merge passed config with defaults, passed config takes precedence
        BOT_CONFIG = { ...BOT_CONFIG, ...msg.config, stopSignal: false };
        logMessage("Start command received by bot worker with config.", "info");
        await runBotAutomation();
    } else if (msg.type === 'stop') {
        logMessage("Stop signal received by bot worker.", "info");
        BOT_CONFIG.stopSignal = true;
    }
});

// Signal readiness to parent if running as a child process
if (process.send) {
    process.send({ type: 'ready' });
} else {
    // This block is for direct execution (e.g., `node bot_worker.js`)
    // Not recommended for full flow, but can be used for isolated testing.
    (async () => {
        logMessage("Bot worker script executed directly (for testing).", "warn");
        // Setup minimal BOT_CONFIG for direct testing
        const testConfig = {
            geminiApiKey: process.env.GEMINI_API_KEY_TEST || BOT_CONFIG.geminiApiKey, // Use test key if available
            userDataDir: path.join(__dirname, 'test_chrome_user_data_puppeteer'),
            outreachDataFile: path.join(__dirname, 'test_outreach.json'),
            messagedContactsFile: path.join(__dirname, 'test_messaged_contacts.txt'),
            chatHistoryBaseFolder: path.join(__dirname, 'test_data', "whatsapp_chats"),
            imageBaseFolder: path.join(__dirname, 'test_data', "whatsapp_images"),
            stopSignal: false
        };
        BOT_CONFIG = { ...BOT_CONFIG, ...testConfig };

        await fs.mkdir(BOT_CONFIG.userDataDir, {recursive: true});
        await fs.mkdir(path.join(__dirname, 'test_data'), {recursive: true});
        const stats = await fs.stat(BOT_CONFIG.outreachDataFile).catch(() => null);
        if (!stats || !stats.isFile()) {
            await saveJson([{title: "Test Ad Direct", whatsapp: "1234567890"}], BOT_CONFIG.outreachDataFile);
            logMessage(`Created dummy outreach file: ${BOT_CONFIG.outreachDataFile}`, "info");
        }
        if (!BOT_CONFIG.geminiApiKey) {
            logMessage("GEMINI_API_KEY not set for direct test. Exiting.", "error");
            return;
        }
        await runBotAutomation();
    })();
}