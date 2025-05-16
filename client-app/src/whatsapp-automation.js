// WhatsApp Automation module
// This module handles the automation of WhatsApp Web using WebAssembly for performance-critical operations

export class WhatsAppAutomation {
  constructor(wasmModule, geminiClient, options = {}) {
    this.wasmModule = wasmModule;
    this.geminiClient = geminiClient;
    this.options = {
      pollingInterval: 2000, // Default polling interval in milliseconds
      enableAiResponses: true, // Enable AI responses by default
      onLog: () => {}, // Default empty log handler
      onMessageProcessed: () => {}, // Default empty message processed handler
      onAiResponseSent: () => {}, // Default empty AI response sent handler
      ...options
    };
    
    this.isRunning = false;
    this.pollingIntervalId = null;
    this.messageHistory = new Map(); // Store message history by contact
  }
  
  // Start the automation process
  async start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.options.onLog('Starting WhatsApp automation', 'info');
    
    // Start polling for new messages
    this.pollingIntervalId = setInterval(() => this.pollForNewMessages(), this.options.pollingInterval);
    
    // Initial poll
    await this.pollForNewMessages();
  }
  
  // Stop the automation process
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    this.options.onLog('Stopping WhatsApp automation', 'info');
    
    // Stop polling
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }
  
  // Poll for new messages
  async pollForNewMessages() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Use WebAssembly module to process the WhatsApp DOM
      const result = this.wasmModule.processWhatsAppDom();
      
      if (result.hasNewMessages) {
        this.options.onLog('New messages detected', 'info');
        
        // Process each new message
        for (const message of result.messages) {
          await this.processMessage(message);
        }
      }
    } catch (error) {
      this.options.onLog(`Error polling for new messages: ${error.message}`, 'error');
      console.error('Error polling for new messages:', error);
    }
  }
  
  // Process a new message
  async processMessage(message) {
    try {
      // Extract message details
      const { contact, text, timestamp } = message;
      
      // Log the new message
      this.options.onLog(`New message from ${contact}: ${text}`, 'info');
      
      // Update message history
      if (!this.messageHistory.has(contact)) {
        this.messageHistory.set(contact, []);
      }
      this.messageHistory.get(contact).push({ role: 'user', content: text, timestamp });
      
      // Notify that a message was processed
      this.options.onMessageProcessed();
      
      // Generate and send AI response if enabled
      if (this.options.enableAiResponses) {
        await this.generateAndSendResponse(contact, text);
      }
    } catch (error) {
      this.options.onLog(`Error processing message: ${error.message}`, 'error');
      console.error('Error processing message:', error);
    }
  }
  
  // Generate and send an AI response
  async generateAndSendResponse(contact, message) {
    try {
      this.options.onLog(`Generating AI response for ${contact}...`, 'info');
      
      // Get conversation history for context
      const history = this.messageHistory.get(contact) || [];
      
      // Generate response using Gemini API
      const response = await this.geminiClient.generateResponse(message, history);
      
      if (response) {
        // Send the response using WebAssembly module
        const success = this.wasmModule.sendWhatsAppMessage(contact, response);
        
        if (success) {
          this.options.onLog(`AI response sent to ${contact}`, 'success');
          
          // Update message history with the AI response
          this.messageHistory.get(contact).push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
          
          // Notify that an AI response was sent
          this.options.onAiResponseSent();
        } else {
          this.options.onLog(`Failed to send AI response to ${contact}`, 'error');
        }
      } else {
        this.options.onLog(`No AI response generated for ${contact}`, 'warning');
      }
    } catch (error) {
      this.options.onLog(`Error generating/sending AI response: ${error.message}`, 'error');
      console.error('Error generating/sending AI response:', error);
    }
  }
}