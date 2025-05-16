// API Integration Test
// This file provides a simple way to test the Gemini API integration

import { GeminiApiClient } from './gemini-api.js';
import { SecureKeyManager } from './secure-key-manager.js';

// Test the direct API integration
export async function testDirectApiIntegration(apiKey) {
  console.log('Testing direct Gemini API integration...');
  
  try {
    // Initialize the key manager and API client
    const keyManager = new SecureKeyManager();
    keyManager.setApiKey(apiKey);
    
    const apiClient = new GeminiApiClient(keyManager);
    
    // Test the connection
    console.log('Testing API connection...');
    await apiClient.testConnection();
    console.log('API connection successful!');
    
    // Generate a test response
    console.log('Generating test response...');
    const response = await apiClient.generateResponse('Hello, can you help me with WhatsApp automation?');
    
    console.log('Generated response:');
    console.log(response);
    
    return {
      success: true,
      message: 'API integration test successful',
      response
    };
  } catch (error) {
    console.error('API integration test failed:', error);
    
    return {
      success: false,
      message: `API integration test failed: ${error.message}`,
      error
    };
  }
}

// If this file is run directly (e.g., for testing)
if (typeof window !== 'undefined' && window.runApiTest) {
  const apiKey = prompt('Enter your Gemini API key for testing:');
  if (apiKey) {
    testDirectApiIntegration(apiKey)
      .then(result => {
        if (result.success) {
          alert('API test successful! Check the console for details.');
        } else {
          alert(`API test failed: ${result.message}`);
        }
      });
  }
}