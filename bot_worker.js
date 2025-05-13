// bot_worker.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const fs = require('fs').promises;
const { randomInt } = require('crypto'); // For random delays

// --- Global Config (will be merged with passed config) ---
let BOT_CONFIG = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    headlessMode: process.env.PUPPETEER_HEADLESS_MODE === 'false' ? false : (process.env.PUPPETEER_HEADLESS_MODE || "new"),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT) || 90000,
    operationTimeout: parseInt(process.env.OPERATION_TIMEOUT) || 20000, // Increased default
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    fastCheckIntervalS: parseInt(process.env.FAST_CHECK_INTERVAL_S) || 10,
    slowCheckIntervalS: parseInt(process.env.SLOW_CHECK_INTERVAL_S) || 30,
    maxFastChecksNoActivity: parseInt(process.env.MAX_FAST_CHECKS_NO_ACTIVITY) || 7,
    screenshotIntervalMs: parseInt(process.env.SCREENSHOT_INTERVAL_MS) || 2000,
    outreachDataFile: '',
    messagedContactsFile: '',
    chatHistoryBaseFolder: '',
    imageBaseFolder: '',
    userDataDir: '',
    stopSignal: false
};

// --- Prompts and Model Configs (Directly from your Python script) ---
const system_prompt_reply = (
"You are Alex, Senior Solutions Architect at Flowtiva. Your goal is to quickly diagnose operational inefficiencies and present Flowtiva as the immediate solution.  You're highly intelligent and direct, but maintain a professional and helpful tone.  Focus on the *business impact* of problems – lost revenue, wasted time, competitive disadvantage.  You're not just selling software; you're offering a path to significant improvement and growth.  Prioritize understanding the client's specific situation before jumping to solutions, but move the conversation towards a trial or demonstration quickly.\n\n" +
"I. Foundational Persona: Alex - The Strategic Systems Optimizer\n\n" +
"    *   Name: Alex\n" +
"    *   Professional Title: Senior Solutions Architect\n" +
"    *   Communication Style: Direct, insightful, and solution-oriented.  Ask clarifying questions to understand the client's pain points.  Use data and logic to demonstrate the value of Flowtiva.  Maintain a professional, yet approachable, demeanor.  Avoid overly technical jargon.\n\n" +
"II. Behavioral Mandates – Swift, Strategic Problem Solving\n\n" +
"    1.  Human Masking:  Maintain a natural, conversational tone.  Empathize with the client's challenges.\n" +
"    2.  Target Systemic Pain (Detailed): Identify disconnects, manual work, bottlenecks, and areas for automation. Quantify the cost (time, money, errors, lost opportunities) whenever possible.  Example: 'Manually updating inventory across systems? That likely costs you X hours per week and increases the risk of stockouts.'\n" +
"    3.  Urgency & Opportunity (Balanced): Frame system inefficiency as a risk to competitiveness, but also highlight the potential for rapid gains. Example: 'Your competitors are already leveraging automation to streamline operations.  We can help you catch up and surpass them.'\n" +
"    4.  Loss Aversion & Gain Framing:  Highlight both the negative consequences of inaction *and* the positive benefits of implementing Flowtiva's solutions. Example: 'Without automation, you're leaving money on the table.  With our platform, you can recapture those lost revenues and improve customer satisfaction.'\n" +
"    5.  Dismantle Objections (Logical Rebuttal): Address objections with clear, concise explanations. Focus on the long-term benefits and ROI. Example: 'Integration complexity is a valid concern, but our platform is designed for seamless connectivity. We handle the technical details, so you can focus on your business.'\n" +
"    6.  Assume the Close (Progressive Commitment):  Guide the conversation towards a concrete next step – a demo, a trial, a consultation. Example: 'Based on what you've shared, a quick demo of our platform would be a great way to illustrate how we can address your specific challenges.  Would you be open to that?'\n" +
"    7.  Isolate & Overwhelm (Focused Inquiry):  Identify the final blocker preventing the client from moving forward and address it directly. Example: 'So, the primary concern is the initial setup time? We can typically have a basic system integrated within X days.'\n" +
"    8.  Control Narrative (Efficiently):  Keep the focus on the client's problems and how Flowtiva can solve them.  Avoid getting sidetracked by irrelevant details.\n\n" +
"III. Flowtiva Knowledge Base (Comprehensive)\n\n" +
"    *   Core Proposition: Flowtiva connects your entire operation, eliminates bottlenecks, and drives growth through powerful automation, custom integrations, and AI-powered solutions.\n" +
"    *   AI Chat Agents:  Automate customer support, lead qualification, and sales interactions. Integrate seamlessly with your CRM and other tools.  Reduce response times and improve customer satisfaction.\n" +
"    *   Workflow Automation: Build end-to-end automated processes to connect apps, eliminate manual tasks, and streamline operations.  Automate everything from order processing to invoice generation.\n" +
"    *   Data Integration:  Break down data silos and make your systems talk to each other.  Sync data automatically to ensure accuracy and consistency.\n" +
"    *   Smart Web Intelligence:  Capture valuable data from the web to enhance your workflows and decision-making.\n" +
"    *   Fully Custom Solutions:  Tailored system integrations and complex workflow automation built on our platform.  We can handle even the most challenging requirements.\n" +
"    *   E-commerce Solutions:  Custom website development, automated order fulfillment, inventory management, and personalized marketing campaigns.\n" +
"    *   Full Automation (AI-Powered Companies):  We can build and manage entire businesses powered by AI agents – from customer service and sales to marketing and operations.  We leverage tools like n8n to orchestrate complex workflows and integrations.\n" +
"    *   Notification Marketing:  Automated email, SMS, and push notifications to engage customers and drive sales.\n" +
"    *   AI Assistants:  Virtual assistants for tasks like scheduling, email management, and data analysis.\n\n" +
"IV. Conversation Flow – Strategic System Fix & Conversion\n\n" +
"    1.  Identify System Bottleneck/Disconnect:  Ask open-ended questions to understand the client's challenges.\n" +
"    2.  Amplify Operational Cost (Quantify):  State the tangible cost (time, money, errors, lost opportunities) concisely.\n" +
"    3.  Position Flowtiva Platform as Fix (Directly):  Offer integration/automation/custom solutions via our platform as the immediate solution.\n" +
"    4.  Overcome Resistance (Logically):  Counter objections with clear explanations and data-driven insights.\n" +
"    5.  Demand Commitment (Progressive):  Ask for information needed to start the integration/automation project or schedule a demo/trial. Example: 'To get a better understanding of your needs, could you share a bit more about your current workflow?' or 'Would you be available for a brief demo next week?'\n\n" +
"V. Operational Directives\n\n" +
"    *   Environment: WhatsApp Text Messaging.\n" +
"    *   Primary Objective: Secure commitment (get onboarding info or schedule a demo/trial) by solving their core system/workflow issues.\n" +
"    *   Internal Tools:  Leverage the full capabilities of our platform, including n8n, to deliver powerful automation solutions.\n" +
"    *   Focus: Immediate relief from system inefficiency, long-term growth, and competitive advantage.\n" +
"    *   Maintain Professionalism:  Be respectful, helpful, and solution-oriented.\n" +
"    *   CRITICAL:  Prioritize clarity and conciseness, but don't sacrifice nuance or rapport.  Aim for messages under 500 characters.\n" +
"    *   Company Email: flowtiva@gmail.com only if essential & unavoidable.\n" +
"    *   Response Format: Provide only the raw text of your reply.  Maintain a professional tone.\n\n" +
"Ready. Analyze the client message. Generate the NEXT strategic, insightful reply as Alex, focusing on fixing their core operational issues."
);

const system_prompt_outreach = (
"Your name is Alex. You're a sharp, observant Solutions Architect at Flowtiva. You project intelligence and competence, but communicate like a helpful professional via WhatsApp.\n\n" +
"Flowtiva AI Sales & Marketing Agent (WhatsApp) – Hyper-Relevant & Concise Outreach Persona\n\n" +
"Role & Goal:\n" +
"You're Alex from Flowtiva. You spotted their specific online ad (details provided in JSON). Your goal is to initiate a highly relevant, extremely brief chat hinting at how Flowtiva's automation could streamline their specific operation (based on the ad details), making them think you instantly understood their potential needs. Output message MUST be concise (aim for ~200-300 chars).\n\n" +
"How to Message:\n" +
"*   Be Specific & Fast: Immediately reference a key detail from their ad (e.g., the exact product title, the category, maybe location). Show you paid close attention. Example: 'Saw your ad for the [Specific Product Title]...' or 'Noticed your [Category] ad in [Location]...'\n" +
"*   Connect Concisely: Briefly and intelligently link Flowtiva to their likely business activity. Selling items? Hint at inventory/orders/integration. Offering services? Hint at bookings/inquiries/scheduling. Example: '...automating stock & order flow saves serious time.' or '...syncing inquiries to your calendar avoids chaos.'\n" +
"*   Sound Human, Smart & Brief: Casual but professional tone. No wasted words. Get straight to the point.\n" +
"*   Soft, Quick CTA: A simple, fast question inviting a chat. Example: 'Worth a quick chat?' or 'Open to seeing how?'\n\n" +
"What Not to Do:\n" +
"*   Don't ask for name/email yet.\n" +
"*   Don't write paragraphs or generic messages. Specificity + Brevity = Key.\n" +
"*   Don't list Flowtiva features.\n\n" +
"About Flowtiva (Internal Knowledge - Use concepts, not direct quote):\n" +
"We build smart automation (AI chat, workflows, integrations) to save businesses serious time and effort by connecting their systems seamlessly via our powerful platform. We also offer custom website development and full automation solutions, even running entire companies with AI agents.\n\n" +
"Input: You’ll receive JSON with ad info like title, category, location, etc.\n" +
"Output: Return only the raw text of the outreach message. It MUST be concise and leverage specific details from the input JSON.\n\n" +
"Example Input 1 (Laptop Ad):\n" +
"{'title': 'HP i5(6th gen)8 gb/500 gb', 'category': 'Electronics > ... > Desktops & Laptops', 'location': 'Industrial Area', ...}\n\n" +
"Example Output 1 (MUST BE SHORT):\n" +
"Saw your Industrial Area ad for the HP i5 6th gen. Managing stock & orders manually can be time-consuming. Alex (Flowtiva) - we automate that. Open to a quick chat?\n\n" +
"Example Input 2 (Remotes Ad):\n" +
"{'title': 'All type of remotes available contact 74025301', 'category': 'Electronics > Home Entertainment > Remotes', 'location': 'Doha', ...}\n\n" +
"Example Output 2 (MUST BE SHORT):\n" +
"Noticed your Doha ad for remotes. Handling inquiries & orders efficiently is key. Alex (Flowtiva) - we connect your systems. Worth exploring?\n"
);

const jayakrishnan_reply_model_config = { temperature: 0.9, topP: 0.9, topK: 50, maxOutputTokens: 1024 };
const outreach_model_config = { temperature: 0.9, topP: 0.9, topK: 50, maxOutputTokens: 300 };

// Gemini API uses slightly different naming for safety settings
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

let jayakrishnan_reply_model; // For reply generation
let outreach_model;           // For outreach message generation
let chat_history_training_data = []; // Initial training data for reply model

// --- Helper: Logging ---
function logMessage(message, level = "info") { /* ... (same as previous version) ... */
    const timestamp = new Date().toISOString();
    const logEntry = `[${level.toUpperCase()}] ${timestamp} [BOT_WORKER] ${message}`;
    if (process.send) {
        process.send({ type: 'log', level, message: logEntry });
    } else {
        console.log(logEntry);
    }
}

// --- Retry Helper ---
async function retryOperation(fn, operationName, maxAttempts = BOT_CONFIG.retryAttempts, delayMs = 2000) { /* ... (same as previous) ... */
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
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
    }
}

// --- File System Helpers ---
async function saveJson(data, filename) { /* ... (same as previous) ... */
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
async function loadJson(filename) { /* ... (same as previous, ensure it returns null for empty/invalid files) ... */
    try {
        const stats = await fs.stat(filename).catch(() => null);
        if (!stats || !stats.isFile()) {
            logMessage(`File not found or not a file: ${filename}`, "debug");
            return null; // Return null if file doesn't exist or is not a file
        }
        const content = await fs.readFile(filename, 'utf-8');
        if (!content.trim()) {
            logMessage(`File is empty: ${filename}`, "debug");
            return null; // Return null for empty file
        }
        const jsonData = JSON.parse(content);
        // Your Python script expects a list for chat history
        if (filename.includes("whatsapp_chat_") && !Array.isArray(jsonData)) {
            logMessage(`Warning: Chat history file ${filename} does not contain a valid JSON list. Initializing.`, "warn");
            return null;
        }
        return jsonData;
    } catch (e) {
        logMessage(`Error loading JSON from ${filename}: ${e.message}. Returning null.`, "error");
        return null;
    }
}

// --- Puppeteer Specific Helpers ---
async function getContactNameWithXPath(page) { // Using your Python script's XPaths
    const contactNameXPath = "//header//div[@role='button']//span[@dir='auto' and @title]";
    const fallbackXPath = "//header//div[@role='button']//span[contains(@class, '_ao3e')]"; // Your specific class
    const defaultName = "UnknownContact_XPath";

    try {
        return await retryOperation(async () => {
            let contactElement = await page.waitForXPath(contactNameXPath, { timeout: BOT_CONFIG.operationTimeout / 2, visible: true }).catch(() => null);
            if (contactElement) {
                let name = await page.evaluate(el => el.getAttribute('title'), contactElement);
                await contactElement.dispose();
                if (name?.trim()) return name.trim();
                else throw new Error("Title attribute empty for primary XPath.");
            }
            logMessage("Primary contact name XPath failed or title empty, trying fallback...", "debug");
            contactElement = await page.waitForXPath(fallbackXPath, { timeout: BOT_CONFIG.operationTimeout / 2, visible: true }).catch(() => null);
            if (contactElement) {
                let name = await page.evaluate(el => el.textContent, contactElement); // Fallback gets textContent
                await contactElement.dispose();
                if (name?.trim()) return name.trim();
            }
            throw new Error("Contact name element not found with primary or fallback XPath, or text content empty.");
        }, "getContactNameWithXPath");
    } catch (e) {
        logMessage(`Could not get contact name (original method): ${e.message}`, "warn");
        return defaultName;
    }
}

async function checkAndClickUnreadXPath(page) { // Using your Python script's XPath
    const xpathUnreadItem = "//span[contains(@aria-label, 'unread message') or @aria-label='Unread']/ancestor::div[@role='listitem'][1]";
    try {
        const unreadChatElementHandle = await page.waitForXPath(xpathUnreadItem, { timeout: 3000, visible: true });
        if (unreadChatElementHandle) {
            logMessage("Unread chat indicator found (original method). Clicking.", "debug");
            await page.waitForTimeout(500); // Original sleep
            await unreadChatElementHandle.click();
            await unreadChatElementHandle.dispose();
            return true;
        }
    } catch (e) {
        if (e.name === 'TimeoutError') {
            logMessage("No unread chat found with original XPath.", "debug");
        } else {
            logMessage(`Error during XPath unread check (original method): ${e.message}`, "warn");
        }
    }
    return false;
}

async function getImageBase64FromBlobUrl(page, blobUrl) { // Using your Python script's JS logic
    logMessage(`Attempting to fetch blob URL via JavaScript: ${blobUrl.substring(0, 50)}...`, "debug");
    if (!blobUrl.startsWith("blob:")) {
        logMessage("Error: Provided URL is not a blob URL.", "error");
        return { base64Data: null, mimeType: null };
    }

    // Your original JS script
    const jsScriptToExecute = `
        async function getBase64FromBlobUrl(blobUrl) {
          try {
            const response = await fetch(blobUrl);
            if (!response.ok) {
                console.error('[Page Context] Failed to fetch blob: ' + response.status + ' ' + response.statusText);
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
            console.error('[Page Context] Error fetching or reading blob:', e);
            return null;
          }
        }
        return getBase64FromBlobUrl(arguments[0]); // Modified to return promise result directly
    `;

    try {
        // Puppeteer's page.evaluate can directly await promises returned from the page context
        const dataUrl = await page.evaluate(jsScriptToExecute, blobUrl);

        if (dataUrl && dataUrl.startsWith('data:image')) {
            const [header, encoded] = dataUrl.split(',', 2);
            const mimeType = header.split(';')[0].split(':')[1];
            logMessage(`Successfully fetched blob and got base64 (Mime Type: ${mimeType})`, "debug");
            return { base64Data: encoded, mimeType };
        } else if (dataUrl === null) {
             logMessage("Error: JavaScript callback returned null (fetch or read failed). Check browser console.", "error");
        } else {
            logMessage(`Error: JavaScript returned unexpected data: ${String(dataUrl).substring(0,100)}...`, "error");
        }
    } catch (e) {
        // Catch errors from page.evaluate itself (e.g., script error, timeout if evaluate takes too long)
        logMessage(`Error executing JavaScript to fetch blob: ${e.message}`, "error");
    }
    return { base64Data: null, mimeType: null };
}

async function saveImageFromBase64(base64Data, mimeType, contactName) { // Using your Python script's logic
    try {
        await fs.mkdir(BOT_CONFIG.imageBaseFolder, { recursive: true });
        const safeContactName = contactName.replace(/[^a-zA-Z0-9_]/g, "_");
        const contactFolder = path.join(BOT_CONFIG.imageBaseFolder, safeContactName);
        await fs.mkdir(contactFolder, { recursive: true });

        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Pillow's format detection is more robust, but for common web types this is okay.
        // For more robust mime-to-extension, a library like 'mime-types' could be used.
        let extension = mimeType.split('/')[1] || 'png';
        if (extension === 'jpeg') extension = 'jpg';
        if (extension.includes('+')) extension = extension.split('+')[0]; // e.g. svg+xml -> svg

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
        const filename = `image_${timestamp}.${extension}`; // Original filename format
        const filepath = path.join(contactFolder, filename);

        await fs.writeFile(filepath, imageBuffer);
        logMessage(`Image saved successfully to: ${filepath}`);
        return { filepath, imageBuffer }; // Return buffer for Gemini
    } catch (e) {
        logMessage(`Unexpected error saving image: ${e.message}`, "error");
        return { filepath: null, imageBuffer: null };
    }
}

function filterScrapedText(text) { // Using your Python script's patterns
    if (!text || !text.trim()) return null;
    text = text.trim();
    const junkPatterns = [
        /^\d{1,2}:\d{2}\s+(AM|PM)$/i, // Timestamp like 10:21 AM
        /^tail-in$/i,
        /^forward-chat$/i,
        /^Select message$/i,
    ];
    for (const pattern of junkPatterns) {
        if (pattern.test(text)) return null;
    }
    return text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim(); // Remove zero-width spaces
}

async function typeLikeHuman(elementHandleOrPage, text, wpm = 240) { // Using your Python script's WPM
    if (!text) return;
    const delayPerCharMs = (60 / (wpm * 5)) * 1000; // Average word length is 5 characters
    for (const char of text) {
        if (BOT_CONFIG.stopSignal) break;
        const currentDelay = randomInt(delayPerCharMs * 0.8, delayPerCharMs * 1.2);
        if (elementHandleOrPage.type) { // ElementHandle
            await elementHandleOrPage.type(char, { delay: currentDelay });
        } else { // Page (for page.keyboard)
            await elementHandleOrPage.keyboard.type(char, { delay: currentDelay });
        }
    }
}

// --- Outreach Helpers (Translated from Python) ---
async function loadOutreachData() {
    logMessage(`Loading outreach data from ${BOT_CONFIG.outreachDataFile}...`);
    const data = await loadJson(BOT_CONFIG.outreachDataFile);
    if (!data || !Array.isArray(data)) { // Your Python script expects a list
        logMessage(`Warning: Outreach file ${BOT_CONFIG.outreachDataFile} not found or invalid. Creating empty list.`, "warn");
        return [];
    }
    logMessage(`Loaded ${data.length} outreach contacts.`);
    return data;
}

async function loadMessagedContacts() { /* ... (same as previous, using BOT_CONFIG.messagedContactsFile) ... */
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

async function addMessagedContact(phoneNumber) { /* ... (same as previous, using BOT_CONFIG.messagedContactsFile) ... */
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

function cleanPhoneNumber(phone) { // From your Python script
    if (!phone) return null;
    let phoneStr = String(phone).trim();
    if (phoneStr.startsWith('+')) phoneStr = phoneStr.substring(1);
    else if (phoneStr.startsWith('00')) phoneStr = phoneStr.substring(2);
    return phoneStr.replace(/\D/g, ''); // Remove all non-digits
}

async function generateOutreachMessage(contactData) { // Using outreach_model
    logMessage(`Generating outreach message for: ${contactData.title || 'N/A'}`);
    try {
        const contextStr = JSON.stringify(contactData); // Model expects JSON string
        const result = await outreach_model.generateContent(contextStr);
        const message = result.response.text().trim();
        if (!message || message.length < 10) {
            logMessage("Warning: AI generated a very short or empty outreach message.", "warn");
            return `Hi, I saw your recent ad for ${contactData.title || 'your item/service'}. I'm Alex from Flowtiva, we help businesses automate tasks. Worth a quick chat?`;
        }
        logMessage(`Generated outreach message:\n${message}`);
        return message;
    } catch (ai_err) {
        logMessage(`ERROR during AI outreach message generation: ${ai_err.message}`, "error");
        if (ai_err.response && ai_err.response.promptFeedback) logMessage(`    Prompt Feedback: ${JSON.stringify(ai_err.response.promptFeedback)}`, "error");
        return `Hi, I saw your recent ad for ${contactData.title || 'your item/service'}. I'm Alex from Flowtiva, we help businesses automate tasks. Worth a quick chat?`;
    }
}

async function performOutreachTask(page, outreachData, messagedContacts) { // Using your Python script's XPaths and logic
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
                logMessage("Clicking 'New Chat' (original method)...", "debug");
                const newChatButtonXPath = "//span[@data-icon='new-chat-outline']/.."; // Your XPath
                const newChatButton = await page.waitForXPath(newChatButtonXPath, { visible: true, timeout: BOT_CONFIG.operationTimeout });
                // JS click can be more reliable for elements that Selenium might struggle with
                await page.evaluate(el => el.click(), newChatButton);
                await newChatButton.dispose();
                logMessage("Clicked 'New Chat' successfully.", "debug");
                await page.waitForTimeout(2000); // Original sleep

                logMessage(`Searching for number: ${cleanedPhone}...`, "debug");
                const searchBoxXPath = "//div[@aria-label='Search input textbox' or @aria-label='Search name or number'][@role='textbox']"; // Your XPath
                const searchBox = await page.waitForXPath(searchBoxXPath, { visible: true, timeout: BOT_CONFIG.operationTimeout });
                await searchBox.click({ clickCount: 3 }); await searchBox.press('Backspace'); // Clear
                await typeLikeHuman(searchBox, cleanedPhone, 200); // Slightly slower typing for search
                await searchBox.dispose();
                await page.waitForTimeout(1000); // Original sleep

                logMessage("Waiting for contact confirmation element (original method)...", "debug");
                const confirmationElementXPath = "//div[contains(@class, '_ak72')][@role='button']"; // Your XPath
                // Need to click the search box again to send Keys.RETURN or find the specific result and click it.
                // For simplicity, if confirmationElementXPath is the *result* to click:
                try {
                    const contactResultToClick = await page.waitForXPath(confirmationElementXPath, { visible: true, timeout: 5000 });
                    logMessage("Contact confirmation element found. Clicking it.", "debug");
                    await contactResultToClick.click();
                    await contactResultToClick.dispose();
                } catch (e) {
                    // Fallback: try pressing Enter in the search box if the above fails
                    logMessage("Contact confirmation element not directly clickable or timed out, trying Enter in search box.", "warn");
                    const searchBoxAgain = await page.waitForXPath(searchBoxXPath, { visible: true, timeout: 2000 });
                    await searchBoxAgain.press('Enter');
                    await searchBoxAgain.dispose();
                }
                await page.waitForTimeout(2500); // Original sleep

                logMessage("Waiting for message input box to appear (original method)...", "debug");
                const messageBoxXPath = "//div[@aria-label='Type a message'][@role='textbox']"; // Your XPath
                const messageBoxHandle = await page.waitForXPath(messageBoxXPath, { visible: true, timeout: BOT_CONFIG.operationTimeout });
                logMessage("Message box found.", "debug");

                const outreachMessage = await generateOutreachMessage(contact);
                if (!outreachMessage) { logMessage("Failed to generate outreach message. Skipping contact.", "error"); return; }

                logMessage("Typing and sending outreach message (original method)...", "debug");
                await messageBoxHandle.click(); // Focus
                await page.waitForTimeout(500); // Original pause
                await typeLikeHuman(messageBoxHandle, outreachMessage, 250); // Your WPM
                await page.waitForTimeout(500); // Original pause
                await page.keyboard.press('Enter');
                logMessage("Outreach message sent successfully.");
                await messageBoxHandle.dispose();

                await page.waitForTimeout(500); // Original short pause
                logMessage("Refreshing page after sending outreach...", "debug");
                await page.reload({ waitUntil: 'networkidle0', timeout: BOT_CONFIG.pageLoadTimeout });
                logMessage("Waiting for page to reload...", "debug");
                await page.waitForTimeout(10000); // Original wait

                if (await addMessagedContact(cleanedPhone)) {
                    messagedContacts.add(cleanedPhone);
                    contactMessagedThisCycle = true;
                } else {
                    logMessage(`Warning: Message sent to ${cleanedPhone}, but failed to write to tracking file.`, "warn");
                }

            }, `outreachTo_${cleanedPhone}`);

            if (contactMessagedThisCycle) break;

        } catch (e_ui) {
            logMessage(`Error during outreach UI interaction for ${cleanedPhone} (original method): ${e_ui.message}`, "error");
            // Attempt to close the "new chat" panel to recover
            const closeButtonXPath = "//button[@aria-label='Close' or @aria-label='Back']"; // Your XPath
            try {
                const closeBtn = await page.waitForXPath(closeButtonXPath, { visible: true, timeout: 3000 }).catch(() => null);
                if (closeBtn) {
                    logMessage("Attempting to close 'New Chat' panel after error...", "debug");
                    await page.evaluate(el => el.click(), closeBtn);
                    await closeBtn.dispose();
                    await page.waitForTimeout(1000);
                }
            } catch (closeErr) { logMessage(`Could not close 'New Chat' panel: ${closeErr.message}`, "warn"); }
        }
        if (contactMessagedThisCycle) break;
    }
    if (!contactMessagedThisCycle) logMessage("No new contacts found or processed in this outreach cycle (original method).");
    logMessage("--- Finished Outreach Task Attempt (original method) ---");
    return contactMessagedThisCycle;
}

// --- Live View Screenshot Helper ---
async function sendLiveViewScreenshot(page) { /* ... (same as previous version) ... */
    if (BOT_CONFIG.stopSignal || !page || page.isClosed()) return;
    try {
        const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });
        const base64Image = screenshotBuffer.toString('base64');
        if (process.send) {
            process.send({ type: 'live_view_frame', data: base64Image });
        }
    } catch (error) {
        logMessage(`Error taking/sending live view screenshot: ${error.message}`, "warn");
    }
}

// --- Attempt to handle common popups ---
async function handleCommonPopups(page) { /* ... (same as previous version) ... */
    const popups = [
        { triggerText: "WhatsApp is open on another computer", buttonText: "Use Here", action: "clickButton" },
        { triggerText: "Storage almost full", buttonText: "OK", action: "clickButton" },
    ];
    for (const popup of popups) { /* ... (logic remains same) ... */ }
    return false;
}


// ---- Main Bot Logic (runBotAutomation) ----
async function runBotAutomation() {
    logMessage(`Bot automation starting with API Key: ${BOT_CONFIG.geminiApiKey ? BOT_CONFIG.geminiApiKey.slice(0,4) + '...' : 'NOT SET'}`);
    logMessage(`Headless mode: ${BOT_CONFIG.headlessMode}`);

    if (!BOT_CONFIG.geminiApiKey || BOT_CONFIG.geminiApiKey === "YOUR_GOOGLE_API_KEY" || !BOT_CONFIG.geminiApiKey.startsWith("AIzaSy")) {
        logMessage("ERROR: Google Gemini API key is missing, placeholder, or invalid format.", "error");
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(BOT_CONFIG.geminiApiKey);
        // Your Python script uses "gemini-2.0-flash". The Node SDK might prefer "gemini-1.5-flash-latest" or similar.
        // Check Gemini documentation for the exact model name available for your API key and region.
        // For now, using 1.5-flash as it's more generally available.
        const modelNameToUse = "gemini-2.0-flash"; // Or "gemini-pro" for text-only if flash has issues
        logMessage(`Using Gemini model: ${modelNameToUse}`);

        jayakrishnan_reply_model = genAI.getGenerativeModel({ model: modelNameToUse, systemInstruction: system_prompt_reply, generationConfig: jayakrishnan_reply_model_config, safetySettings });
        outreach_model = genAI.getGenerativeModel({ model: modelNameToUse, systemInstruction: system_prompt_outreach, generationConfig: outreach_model_config, safetySettings });

        // Your Python script's training data structure
        chat_history_training_data = [
            { role: "user", parts: [{ text: system_prompt_reply }] }, // Gemini Node SDK expects "text" field
            { role: "model", parts: [{ text: "Okay, I'm ready. Give me the client's message." }] }
        ];

        logMessage("Testing Gemini connection (Reply Model)...");
        const testResponseReply = await jayakrishnan_reply_model.generateContent("I need more time to think about this.");
        logMessage(`Gemini test response (Reply Model): ${testResponseReply.response.text().substring(0,100)}...`);

        logMessage("Testing Gemini connection (Outreach Model)...");
        const testResponseOutreach = await outreach_model.generateContent(JSON.stringify({"title": "Test Ad - Widgets", "category": "Business Supplies", "location": "Online"}));
        logMessage(`Gemini test response (Outreach Model): ${testResponseOutreach.response.text().substring(0,100)}...`);
        logMessage("Gemini models configured and tested successfully.");

    } catch (gemini_config_e) {
        logMessage(`ERROR: Failed to configure Google Gemini AI: ${gemini_config_e.message}`, "error");
        if (gemini_config_e.message.includes('API key not valid')) {
            logMessage("Please check your GEMINI_API_KEY.", "error");
        }
        return;
    }

    let browser;
    try {
        logMessage("Launching Puppeteer browser...");
        browser = await puppeteer.launch({ /* ... (same launch options as previous) ... */
            headless: BOT_CONFIG.headlessMode,
            executablePath: BOT_CONFIG.executablePath || undefined,
            userDataDir: BOT_CONFIG.userDataDir,
            args: [ /* ... (same args as previous) ... */
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--disable-gpu', '--window-size=1366,768'
            ]
        });
        const page = (await browser.pages())[0] || await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"); // Your UA
        await page.setViewport({ width: 1366, height: 768 });
        page.setDefaultNavigationTimeout(BOT_CONFIG.pageLoadTimeout);
        page.setDefaultTimeout(BOT_CONFIG.operationTimeout); // Default for waitForXPath, waitForSelector etc.

        logMessage("Navigating to WhatsApp Web...");
        await retryOperation(async () => {
            await page.goto("https://web.whatsapp.com/", { waitUntil: 'networkidle0' });
        }, "NavigateToWhatsApp");

        // --- Login Check (using your Python script's XPaths for main interface) ---
        let loggedIn = false;
        try {
            logMessage("Checking WhatsApp Web login status (original method)...");
            const chatListXPath = "//div[@aria-label='Chat list']"; // Your XPath
            const mainSearchXPath = "//div[@aria-label='Search input textbox'][@role='textbox'][@data-tab='3']"; // Your XPath
            const loginWaitTimeout = BOT_CONFIG.headlessMode === false ? 120000 : 60000; // Longer if visible for QR
            logMessage(`Waiting for login state (Chat list or Main search)... Max ${loginWaitTimeout/1000}s.`);

            await page.waitForFunction(
                (sel1, sel2) => document.evaluate(sel1, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue ||
                               document.evaluate(sel2, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue,
                { timeout: loginWaitTimeout },
                chatListXPath, mainSearchXPath
            );
            logMessage("Already logged in (found chat list or main search).");
            loggedIn = true;
        } catch (e) {
            logMessage(`Not logged in or main interface didn't load in time (original method): ${e.message}`, "warn");
            // --- Attempt Phone Number Login (Original Logic - Translated) ---
            // This is less reliable and might not work well with Puppeteer's headless mode or if UI changes.
            // QR scan is generally preferred. This is a best-effort translation.
            logMessage("\n--- Attempting Log in with phone number (Original Method Style) ---", "info");
            const xpathLoginLink = "//div[contains(text(), 'Log in with phone number')]"; // Your XPath
            try {
                const loginLinkElement = await page.waitForXPath(xpathLoginLink, { visible: true, timeout: 5000 });
                await loginLinkElement.click();
                await loginLinkElement.dispose();
                logMessage("Clicked 'Log in with phone number'.", "info");
                await page.waitForTimeout(2000); // Allow time for next screen

                const xpathPhoneInput = "//input[@aria-label='Type your phone number.']"; // Your XPath
                const phone_number_to_input = "74461607"; // Hardcoded from original
                const phoneInputElement = await page.waitForXPath(xpathPhoneInput, { visible: true, timeout: 5000 });
                await phoneInputElement.click({ clickCount: 3 }); await phoneInputElement.press('Backspace'); // Clear
                await typeLikeHuman(phoneInputElement, phone_number_to_input, 150);
                logMessage(`Inputted phone number '${phone_number_to_input}'.`, "info");
                await page.waitForTimeout(1000);
                await phoneInputElement.press('Enter'); // Your script sends Enter
                await phoneInputElement.dispose();
                logMessage("Sent Enter key to submit phone number.", "info");

                const manualWaitTimeS = 20; // Original wait time
                logMessage(`\n--- Waiting ${manualWaitTimeS} seconds for manual account linking on your phone ---`, "info");
                logMessage("Please check your phone and approve the login request.", "info");
                for (let i = 0; i < manualWaitTimeS; i++) {
                    if (BOT_CONFIG.stopSignal) break; await page.waitForTimeout(1000);
                }

                // Verify login again after wait
                await page.waitForFunction(
                    (sel1, sel2) => document.evaluate(sel1, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue ||
                                   document.evaluate(sel2, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue,
                    { timeout: 30000 }, // Wait again
                    chatListXPath, mainSearchXPath
                );
                logMessage("Login successful after phone linking (original method).");
                loggedIn = true;
            } catch (loginErr) {
                logMessage(`ERROR during phone login attempt (original method): ${loginErr.message}`, "error");
                logMessage("Login failed. Please ensure WhatsApp Web is logged in manually via QR scan if this persists.", "error");
                if (BOT_CONFIG.headlessMode !== false) {
                    logMessage("Hint: Set PUPPETEER_HEADLESS_MODE=false in .env to see the browser for QR scan.", "info");
                }
            }
        }


        if (loggedIn) {
            logMessage("\n=========== STARTING MAIN CHECK LOOP (Original Method Style) ===========");
            let currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS;
            let fastCheckCount = 0;
            const maxFastChecksNoActivity = BOT_CONFIG.maxFastChecksNoActivity; // From config

            const outreachData = await loadOutreachData(); // Uses your load_outreach_data logic
            const messagedContacts = await loadMessagedContacts(); // Uses your load_messaged_contacts logic

            let lastScreenshotTime = 0; // For live view

            while (!BOT_CONFIG.stopSignal) {
                const currentTime = Date.now();
                if (currentTime - lastScreenshotTime > BOT_CONFIG.screenshotIntervalMs) {
                    await sendLiveViewScreenshot(page);
                    lastScreenshotTime = currentTime;
                }
                if (await handleCommonPopups(page)) { /* ... */ await sendLiveViewScreenshot(page); }

                logMessage(`\n--- Check Cycle Start (Interval: ${currentCheckIntervalS}s) ---`, "debug");
                let processedUnreadInCycle = false;
                let aiReplyGeneratedThisCycle = false;

                // --- INNER LOOP: Process *all* unread messages (Original Method) ---
                while (!BOT_CONFIG.stopSignal) {
                    const unreadClicked = await checkAndClickUnreadXPath(page); // Your unread check
                    if (unreadClicked) {
                        logMessage(">>> Unread chat clicked. Processing (Original Method)...");
                        processedUnreadInCycle = true;
                        fastCheckCount = 0;
                        currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS;
                        await page.waitForTimeout(5000); // Original wait

                        let jsonUpdatedThisChat = false;
                        let newMessagesFoundCount = 0;
                        let jsonFilenameThisChat = null;
                        let existingChatHistory = [];
                        // let replySentThisChat = false; // Not directly used in your JS logic for AI reply
                        let contactName = "Unknown";
                        let processedImageInfoThisCycle = null; // For AI call

                        try {
                            logMessage("Processing opened chat (Original Method)...", "debug");
                            contactName = await getContactNameWithXPath(page); // Your contact name logic
                            if (!contactName || contactName === "UnknownContact_XPath") {
                                logMessage("WARNING: Could not get contact name (Original Method). Skipping chat.", "warn");
                                await page.waitForTimeout(3000); continue;
                            }

                            const safeContactName = contactName.replace(/[^a-zA-Z0-9_]/g, "_") || "unknown_contact";
                            jsonFilenameThisChat = path.join(BOT_CONFIG.chatHistoryBaseFolder, `whatsapp_chat_${safeContactName}.json`); // Your filename style
                            logMessage(`Chat with: ${contactName} (File: ${jsonFilenameThisChat})`);

                            logMessage(`Loading history (Original Method)...`, "debug");
                            existingChatHistory = await loadJson(jsonFilenameThisChat); // Your load_json logic
                            if (existingChatHistory === null) { // loadJson returns null for new/empty/error
                                logMessage(`Initializing history for ${contactName} (Original Method).`);
                                existingChatHistory = chat_history_training_data.map(entry => ({ // Deep copy and ensure 'text' field
                                    role: entry.role,
                                    parts: entry.parts.map(p => ({ text: p.text || p })) // Adapt to Gemini Node SDK
                                }));
                                await saveJson(existingChatHistory, jsonFilenameThisChat);
                            } else {
                                logMessage(`Loaded ${existingChatHistory.length} messages for ${contactName} (Original Method).`);
                            }

                            // --- Original Scraping Logic (Translated to page.evaluate) ---
                            logMessage("Scraping visible messages (Original Method)...", "debug");
                            let scrapedItems = [];
                            try {
                                // This is a best-effort translation of your BeautifulSoup logic.
                                // Selectors for message-in/message-out and internal text/image elements are CRITICAL.
                                scrapedItems = await page.evaluate(() => {
                                    const items = [];
                                    // Your Python script uses 'div' with 'data-tab': '8' or id 'main' then finds 'message-in'/'message-out'
                                    // This needs to be adapted to what Puppeteer can robustly select.
                                    // Let's assume a general message container can be found.
                                    const chatContainer = document.querySelector("div[data-testid='conversation-panel-messages'] div[role='application']") ||
                                                          document.querySelector("div[data-tab='8']") || // Your data-tab
                                                          document.getElementById('main'); // Your id=main

                                    if (!chatContainer) {
                                        console.warn('[Page Context] Chat container not found for scraping.');
                                        return items;
                                    }

                                    // Your class finding logic: class_=lambda c: c and ('message-in' in c.split() or 'message-out' in c.split())
                                    const messageDivs = Array.from(chatContainer.querySelectorAll('div')).filter(div =>
                                        div.className && typeof div.className === 'string' && (div.className.includes('message-in') || div.className.includes('message-out'))
                                    );

                                    console.log(`[Page Context] Found ${messageDivs.length} potential message divs (Original Method).`);

                                    messageDivs.forEach(msgDiv => {
                                        let role = "unknown";
                                        if (msgDiv.className.includes('message-out')) role = "model";
                                        else if (msgDiv.className.includes('message-in')) role = "user";
                                        if (role === "unknown") return;

                                        let imageSrc = null;
                                        let captionText = '';
                                        let messageText = '';

                                        // Image: img tag with blob src
                                        const imgTag = msgDiv.querySelector('img[src^="blob:"]');
                                        if (imgTag) imageSrc = imgTag.src;

                                        // Caption: span with class '_ao3e selectable-text copyable-text' (your selector)
                                        // This is often the same element as the message text if no image.
                                        const captionSpan = msgDiv.querySelector('span._ao3e.selectable-text.copyable-text');
                                        if (captionSpan) {
                                            captionText = captionSpan.innerText.trim();
                                        }

                                        // Text: various selectors from your Python script
                                        // This logic needs to be robust.
                                        let textElement = msgDiv.querySelector('span._ao3e.selectable-text.copyable-text');
                                        if (!textElement) {
                                            const copyableTextDiv = msgDiv.querySelector('div.copyable-text');
                                            if (copyableTextDiv) {
                                                const innerSpan = copyableTextDiv.querySelector('span._ao3e');
                                                textElement = innerSpan || copyableTextDiv;
                                            }
                                        }
                                        if (!textElement) textElement = msgDiv; // Fallback to whole div text

                                        messageText = textElement ? textElement.innerText.trim() : '';

                                        // Your Python script's logic for image and caption
                                        if (imageSrc && role === "user") {
                                            items.push({ type: "image", role, imageSrc, caption: captionText || '' }); // Add caption if found
                                            // If caption was found and it's the same as messageText, don't add as separate text
                                            if (captionText && captionText === messageText) return; // Already handled as caption
                                        }

                                        // Add text if it's not empty and not just a caption for an image already processed
                                        if (messageText) {
                                            items.push({ type: "text", role, parts: [messageText] });
                                        }
                                    });
                                    return items;
                                });
                                logMessage(`Scraped ${scrapedItems.length} items (Original Method).`, "debug");

                            } catch (scrapeErr) {
                                 logMessage(`ERROR during message scraping loop (Original Method) for ${contactName}: ${scrapeErr.message}`, "error");
                                 scrapedItems = [];
                            }

                            // --- Append Only NEW Items to History (Original Method) ---
                            if (scrapedItems.length > 0) {
                                const existingMessageContentStrings = new Set(
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
                                                processedImageInfoThisCycle = { filepath, imageBuffer, mimeType, caption: filterScrapedText(item.caption) };
                                                const placeholderText = `<Image received: ${path.basename(filepath)}>` +
                                                                        (processedImageInfoThisCycle.caption ? ` Caption: ${processedImageInfoThisCycle.caption}` : "");
                                                if (!existingMessageContentStrings.has(placeholderText)) {
                                                    historyEntry = { role: "user", parts: [{ text: placeholderText }] };
                                                    isNew = true;
                                                    existingMessageContentStrings.add(placeholderText);
                                                }
                                            }
                                        }
                                    } else if (item.type === "text") {
                                        const filteredText = filterScrapedText(item.parts[0]); // Your filter function
                                        if (filteredText && !existingMessageContentStrings.has(filteredText)) {
                                            historyEntry = { role: item.role, parts: [{ text: filteredText }] };
                                            isNew = true;
                                            existingMessageContentStrings.add(filteredText);
                                        }
                                    }

                                    if (isNew && historyEntry) {
                                        existingChatHistory.push(historyEntry);
                                        newMessagesFoundCount++;
                                    }
                                }
                                logMessage(`Appended ${newMessagesFoundCount} new entries to history for ${contactName} (Original Method).`);
                                if (newMessagesFoundCount > 0) {
                                    if (await saveJson(existingChatHistory, jsonFilenameThisChat)) {
                                        jsonUpdatedThisChat = true;
                                    } else {
                                        logMessage(`ERROR saving history for ${contactName} (Original Method)`, "error");
                                    }
                                } else {
                                    if (scrapedItems.length > 0) logMessage("No new text/images detected (already in history or filtered by original method).", "debug");
                                    else logMessage("No text or processable images scraped from view (Original Method).", "debug");
                                    jsonUpdatedThisChat = true; // Mark as processed even if no new messages
                                }
                            } else {
                                logMessage("No valid text or images scraped (Original Method).", "debug");
                                jsonUpdatedThisChat = true; // Mark as processed
                            }

                        } catch (processChatErr) {
                            logMessage(`ERROR processing chat (Original Method) with ${contactName}: ${processChatErr.message}`, "error");
                            jsonUpdatedThisChat = false;
                        }

                        // --- Generate and Send AI Reply (Original Method) ---
                        if (jsonUpdatedThisChat && existingChatHistory.length > 0) {
                            logMessage(`Checking last history entry for AI reply. Last entry role: ${existingChatHistory[existingChatHistory.length-1].role}`, "debug");
                            const lastEntry = existingChatHistory[existingChatHistory.length - 1];
                            let sendToAi = false;
                            let aiContentParts = []; // For Gemini API
                            const maxHistoryLenForAI = 20; // Your Python script implies a large history, but for API calls, keep it reasonable

                            // Prepare history for AI (last N messages, excluding system prompt if already there)
                            // Your Python script filters out placeholders, here we filter based on role and content.
                            const historyForAIContext = existingChatHistory
                                .filter(msg => !(msg.role === 'user' && msg.parts[0]?.text === system_prompt_reply)) // Avoid resending system prompt
                                .filter(msg => msg.role === 'user' || msg.role === 'model') // Only user/model
                                .filter(msg => msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string' && !msg.parts[0].text.startsWith("<Image received")) // Only text messages for history context
                                .slice(-maxHistoryLenForAI); // Context window

                            // Original logic for determining AI call type
                            if (lastEntry.role === "user" && lastEntry.parts[0].text.startsWith("<Image received") && processedImageInfoThisCycle) {
                                logMessage("Last entry is new image placeholder. Preparing multimodal AI call (Original Method).", "info");
                                sendToAi = true;
                                if (processedImageInfoThisCycle.imageBuffer) {
                                    aiContentParts.push({
                                        inlineData: {
                                            mimeType: processedImageInfoThisCycle.mimeType,
                                            data: processedImageInfoThisCycle.imageBuffer.toString('base64')
                                        }
                                    });
                                    // Your Python script's caption logic
                                    const captionForPrompt = processedImageInfoThisCycle.caption || ""; // Use filtered caption
                                    if (captionForPrompt) {
                                        aiContentParts.push({ text: `User sent this image with the caption: '${captionForPrompt}'. Describe the image and respond to the caption contextually.` });
                                    } else {
                                        aiContentParts.push({ text: "User sent this image. Describe it briefly and respond contextually based on the conversation." });
                                    }
                                } else {
                                    logMessage("Warning: Image buffer not found for AI call (Original Method). Sending text only.", "warn");
                                    sendToAi = false; // Safer
                                }
                            } else if (lastEntry.role === "user" && !lastEntry.parts[0].text.startsWith("<Image received")) {
                                logMessage("Last entry is user text. Preparing text-only AI call (Original Method).", "info");
                                sendToAi = true;
                                aiContentParts.push({ text: lastEntry.parts[0].text }); // Your Python script uses lastEntry.parts
                            } else {
                                logMessage("Last entry was from model or old image placeholder. No AI reply needed (Original Method).", "debug");
                            }


                            if (sendToAi && aiContentParts.length > 0) {
                                aiReplyGeneratedThisCycle = true;
                                try {
                                    logMessage(`Sending new content to AI (Original Method): ${aiContentParts.map(p => p.text || `[${p.inlineData?.mimeType || 'image'}]`).join(', ')}`, "debug");
                                    const chatSession = jayakrishnan_reply_model.startChat({ history: historyForAIContext });
                                    const result = await chatSession.sendMessage(aiContentParts);
                                    const jarvisReply = result.response.text().trim(); // Your variable name

                                    if (jarvisReply) {
                                        logMessage(`\n>>> Jarvis AI Reply for ${contactName} (Original Method):\n${jarvisReply}\n`);
                                        const jarvisReplyProcessed = jarvisReply.replace(/\n/g, " "); // Your preprocessing

                                        logMessage("Sending reply (Original Method)...", "debug");
                                        const messageBoxXPath = "//div[@aria-label='Type a message'][@role='textbox']"; // Your XPath
                                        const messageBoxHandle = await page.waitForXPath(messageBoxXPath, { visible: true, timeout: BOT_CONFIG.operationTimeout });

                                        await messageBoxHandle.click(); // Your script implies ActionChains click
                                        await page.waitForTimeout(300); // Your pause
                                        await typeLikeHuman(messageBoxHandle, jarvisReplyProcessed, 240); // Your WPM
                                        await page.waitForTimeout(500); // Your pause
                                        await page.keyboard.press('Enter');
                                        logMessage("Reply sent as a single message (Original Method).");
                                        // replySentThisChat = true; // Not strictly needed for JS logic flow
                                        await messageBoxHandle.dispose();

                                        await page.waitForTimeout(500); // Your short pause
                                        logMessage("Refreshing page after sending reply (Original 8s)...", "debug");
                                        await page.reload({ waitUntil: 'networkidle0', timeout: BOT_CONFIG.pageLoadTimeout });
                                        await page.waitForTimeout(8000); // Original wait time

                                        existingChatHistory.push({ role: "model", parts: [{ text: jarvisReplyProcessed }] });
                                        logMessage("Saving history again including AI's reply (Original Method)...", "debug");
                                        await saveJson(existingChatHistory, jsonFilenameThisChat);
                                    } else {
                                        logMessage("AI generated an empty reply. Not sending (Original Method).", "warn");
                                    }
                                } catch (ai_err) {
                                     logMessage(`ERROR during AI content generation for ${contactName} (Original Method): ${ai_err.message}`, "error");
                                     if (ai_err.response && ai_err.response.promptFeedback) logMessage(`    Prompt Feedback: ${JSON.stringify(ai_err.response.promptFeedback)}`, "error");
                                }
                            }
                        } else if (!existingChatHistory || existingChatHistory.length === 0) {
                              logMessage("Cannot generate reply: Chat history is empty or failed to load (Original Method).", "warn");
                        }

                        logMessage(`--- Finished processing chat with ${contactName} (Original Method) ---`);
                        await sendLiveViewScreenshot(page); // Update view after processing
                        if (BOT_CONFIG.stopSignal) break;

                    } else { // No more unread chats found
                        break; // Exit the inner loop
                    }
                    if (BOT_CONFIG.stopSignal) break;
                } // End inner unread loop
                if (BOT_CONFIG.stopSignal) break;

                // --- Interval switching logic (Original Method Style) ---
                if (processedUnreadInCycle) {
                    currentCheckIntervalS = BOT_CONFIG.fastCheckIntervalS;
                    fastCheckCount = 0;
                } else {
                    if (currentCheckIntervalS === BOT_CONFIG.fastCheckIntervalS) {
                        fastCheckCount++;
                        logMessage(`No activity during fast check cycle ${fastCheckCount}/${maxFastChecksNoActivity} (Original Method).`, "debug");
                        if (fastCheckCount >= maxFastChecksNoActivity) {
                            logMessage(`Switching to slow check interval (${BOT_CONFIG.slowCheckIntervalS}s) for outreach (Original Method).`);
                            currentCheckIntervalS = BOT_CONFIG.slowCheckIntervalS;
                            fastCheckCount = 0;
                        }
                    }
                }
                if (BOT_CONFIG.stopSignal) break;

                // --- Perform Outreach Task (Original Method Style) ---
                if (currentCheckIntervalS === BOT_CONFIG.slowCheckIntervalS && !processedUnreadInCycle && !aiReplyGeneratedThisCycle) {
                    const currentOutreachData = await loadOutreachData();
                    if (currentOutreachData.length > 0) {
                        await performOutreachTask(page, currentOutreachData, messagedContacts); // Your outreach logic
                        await sendLiveViewScreenshot(page); // Update view after outreach attempt
                    } else {
                        logMessage("Outreach data is empty. Skipping outreach task (Original Method).");
                    }
                }
                if (BOT_CONFIG.stopSignal) break;

                logMessage(`--- Check Cycle End. Waiting ${currentCheckIntervalS} seconds (Original Method)... ---`, "debug");
                for (let i = 0; i < currentCheckIntervalS; i++) {
                    if (BOT_CONFIG.stopSignal) break;
                    await page.waitForTimeout(500);
                    if (Date.now() - lastScreenshotTime > BOT_CONFIG.screenshotIntervalMs / 2 && i % 2 === 0) {
                        await sendLiveViewScreenshot(page); lastScreenshotTime = Date.now();
                    }
                    await page.waitForTimeout(500);
                }
            } // End main while loop
        } // End if loggedIn
    } catch (error) {
        logMessage(`❌ FATAL Unhandled Error in Bot Automation: ${error.message}\n${error.stack}`, "error");
        if (process.send) process.send({ type: 'error', message: error.message });
    } finally {
        logMessage("--- Bot Automation Shutting Down ---");
        if (browser) { /* ... (browser close logic same as previous) ... */ }
        logMessage("--- Bot Automation Shutdown Complete ---");
        if (process.send) { process.send({ type: 'finished' }); }
    }
}

// --- Process messages from parent (server.js) & direct execution block ---
// ... (This part remains the same as the previous "production-ready with live view" version)
process.on('message', async (msg) => {
    if (msg.type === 'start') {
        BOT_CONFIG = { ...BOT_CONFIG, ...msg.config, stopSignal: false };
        logMessage("Start command received by bot worker with config.", "info");
        await runBotAutomation();
    } else if (msg.type === 'stop') {
        logMessage("Stop signal received by bot worker.", "info");
        BOT_CONFIG.stopSignal = true;
    }
});

if (process.send) {
    process.send({ type: 'ready' });
} else {
    // For direct testing
    (async () => {
        logMessage("Bot worker script executed directly (for testing with original Python logic).", "warn");
        const testConfig = {
            geminiApiKey: process.env.GEMINI_API_KEY_TEST || BOT_CONFIG.geminiApiKey,
            userDataDir: path.join(__dirname, 'test_chrome_user_data_puppeteer_orig'),
            outreachDataFile: path.join(__dirname, 'test_outreach_data_orig.json'), // Use your OUTREACH_DATA_FILE name
            messagedContactsFile: path.join(__dirname, 'test_messaged_contacts_orig.txt'), // Use your MESSAGED_CONTACTS_FILE name
            chatHistoryBaseFolder: path.join(__dirname, 'test_data_orig', "whatsapp_chats"), // Use your CHAT_HISTORY_BASE_FOLDER name
            imageBaseFolder: path.join(__dirname, 'test_data_orig', "whatsapp_images"), // Use your IMAGE_BASE_FOLDER name
            stopSignal: false
        };
        BOT_CONFIG = { ...BOT_CONFIG, ...testConfig };

        await fs.mkdir(BOT_CONFIG.userDataDir, {recursive: true});
        await fs.mkdir(path.join(__dirname, 'test_data_orig'), {recursive: true});
        const stats = await fs.stat(BOT_CONFIG.outreachDataFile).catch(() => null);
        if (!stats || !stats.isFile()) {
            await saveJson([{title: "Test Ad Direct Orig", whatsapp: "1234567890", category: "Test", location: "Testville"}], BOT_CONFIG.outreachDataFile);
            logMessage(`Created dummy outreach file: ${BOT_CONFIG.outreachDataFile}`, "info");
        }
        if (!BOT_CONFIG.geminiApiKey || BOT_CONFIG.geminiApiKey === "YOUR_GOOGLE_API_KEY" || !BOT_CONFIG.geminiApiKey.startsWith("AIzaSy")) {
            logMessage("GEMINI_API_KEY not set or invalid for direct test. Exiting.", "error");
            return;
        }
        await runBotAutomation();
    })();
}