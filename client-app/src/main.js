// Import modules
import { initWasm } from './wasm-loader.js';
import { WhatsAppAutomation } from './whatsapp-automation.js';
import { GeminiApiClient } from './gemini-api.js';
import { SecureKeyManager } from './secure-key-manager.js';

// DOM elements
const startButton = document.getElementById('start-automation');
const stopButton = document.getElementById('stop-automation');
const openWhatsAppButton = document.getElementById('open-whatsapp');
const refreshPreviewButton = document.getElementById('refresh-preview');
const clearLogsButton = document.getElementById('clear-logs');
const apiKeyInput = document.getElementById('gemini-api-key');
const pollingIntervalInput = document.getElementById('polling-interval');
const enableAiResponsesCheckbox = document.getElementById('enable-ai-responses');
const whatsappPreview = document.getElementById('whatsapp-preview');
const automationStatus = document.getElementById('automation-status');
const messagesProcessed = document.getElementById('messages-processed');
const aiResponsesSent = document.getElementById('ai-responses-sent');
const lastActivity = document.getElementById('last-activity');
const automationLogs = document.getElementById('automation-logs');

// Application state
let wasmModule = null;
let automation = null;
let geminiClient = null;
let keyManager = null;
let isRunning = false;
let stats = {
  messagesProcessed: 0,
  aiResponsesSent: 0
};

// Initialize the application
async function init() {
  try {
    // Initialize the secure key manager
    keyManager = new SecureKeyManager();
    
    // Log initialization
    logMessage('Initializing application...', 'info');
    
    // Load WebAssembly module
    logMessage('Loading WebAssembly module...', 'info');
    wasmModule = await initWasm();
    logMessage('WebAssembly module loaded successfully', 'success');
    
    // Set up event listeners
    setupEventListeners();
    
    logMessage('Application initialized and ready', 'success');
  } catch (error) {
    logMessage(`Initialization error: ${error.message}`, 'error');
    console.error('Initialization error:', error);
  }
}

// Set up event listeners for UI interactions
function setupEventListeners() {
  startButton.addEventListener('click', startAutomation);
  stopButton.addEventListener('click', stopAutomation);
  openWhatsAppButton.addEventListener('click', openWhatsApp);
  refreshPreviewButton.addEventListener('click', refreshWhatsAppPreview);
  clearLogsButton.addEventListener('click', clearLogs);
}

// Start the automation process
async function startAutomation() {
  try {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      logMessage('Please enter a Gemini API key', 'error');
      return;
    }
    
    // Store API key securely in memory
    keyManager.setApiKey(apiKey);
    
    // Clear the input field for security
    apiKeyInput.value = '';
    
    const pollingInterval = parseInt(pollingIntervalInput.value, 10);
    const enableAiResponses = enableAiResponsesCheckbox.checked;
    
    // Initialize Gemini API client
    geminiClient = new GeminiApiClient(keyManager);
    
    // Test API key
    logMessage('Testing Gemini API connection...', 'info');
    try {
      await geminiClient.testConnection();
      logMessage('Gemini API connection successful', 'success');
    } catch (error) {
      logMessage(`Gemini API connection failed: ${error.message}`, 'error');
      return;
    }
    
    // Initialize WhatsApp automation
    automation = new WhatsAppAutomation(wasmModule, geminiClient, {
      pollingInterval,
      enableAiResponses,
      onLog: logMessage,
      onMessageProcessed: () => {
        stats.messagesProcessed++;
        updateStats();
      },
      onAiResponseSent: () => {
        stats.aiResponsesSent++;
        updateStats();
      }
    });
    
    // Open WhatsApp Web
    openWhatsApp();
    
    // Start automation
    await automation.start();
    isRunning = true;
    
    // Update UI
    startButton.disabled = true;
    stopButton.disabled = false;
    automationStatus.textContent = 'Running';
    automationStatus.className = 'text-success';
    
    logMessage('Automation started', 'success');
  } catch (error) {
    logMessage(`Failed to start automation: ${error.message}`, 'error');
    console.error('Start automation error:', error);
  }
}

// Stop the automation process
async function stopAutomation() {
  try {
    if (automation) {
      await automation.stop();
    }
    
    isRunning = false;
    
    // Update UI
    startButton.disabled = false;
    stopButton.disabled = true;
    automationStatus.textContent = 'Stopped';
    automationStatus.className = 'text-danger';
    
    // Clear sensitive data
    keyManager.clearApiKey();
    
    logMessage('Automation stopped', 'info');
  } catch (error) {
    logMessage(`Failed to stop automation: ${error.message}`, 'error');
    console.error('Stop automation error:', error);
  }
}

// Open WhatsApp Web in the iframe
function openWhatsApp() {
  whatsappPreview.src = 'https://web.whatsapp.com/';
  logMessage('Opening WhatsApp Web...', 'info');
}

// Refresh the WhatsApp Web preview
function refreshWhatsAppPreview() {
  whatsappPreview.src = whatsappPreview.src;
  logMessage('Refreshing WhatsApp Web preview', 'info');
}

// Clear the logs
function clearLogs() {
  automationLogs.innerHTML = '';
  logMessage('Logs cleared', 'info');
}

// Log a message to the UI
function logMessage(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${level}`;
  logEntry.textContent = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  automationLogs.appendChild(logEntry);
  automationLogs.scrollTop = automationLogs.scrollHeight;
  
  // Update last activity
  lastActivity.textContent = timestamp;
}

// Update statistics in the UI
function updateStats() {
  messagesProcessed.textContent = stats.messagesProcessed;
  aiResponsesSent.textContent = stats.aiResponsesSent;
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
  if (isRunning && automation) {
    automation.stop();
  }
  
  // Clear sensitive data
  if (keyManager) {
    keyManager.clearApiKey();
  }
});