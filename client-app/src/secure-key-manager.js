// Secure Key Manager
// This module handles secure storage of API keys in memory

export class SecureKeyManager {
  constructor() {
    // Use a closure to keep the API key private
    // This is more secure than storing it as a property on the object
    let apiKey = null;
    
    // Method to set the API key
    this.setApiKey = (key) => {
      if (!key) {
        throw new Error('API key cannot be empty');
      }
      apiKey = key;
    };
    
    // Method to get the API key
    this.getApiKey = () => {
      return apiKey;
    };
    
    // Method to clear the API key
    this.clearApiKey = () => {
      apiKey = null;
    };
  }
}