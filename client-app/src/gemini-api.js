// Gemini API Client
// This module handles communication with the Gemini API

import axios from 'axios';

export class GeminiApiClient {
  constructor(keyManager) {
    this.keyManager = keyManager;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = 'gemini-1.5-flash'; // Default model
  }
  
  // Test the API connection
  async testConnection() {
    try {
      const apiKey = this.keyManager.getApiKey();
      if (!apiKey) {
        throw new Error('API key not available');
      }
      
      // Make a simple request to test the API key
      const response = await axios.get(
        `${this.baseUrl}?key=${apiKey}`
      );
      
      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      return true;
    } catch (error) {
      console.error('Gemini API test connection error:', error);
      throw new Error(`Failed to connect to Gemini API: ${error.message}`);
    }
  }
  
  // Generate a response using the Gemini API
  async generateResponse(message, history = []) {
    try {
      const apiKey = this.keyManager.getApiKey();
      if (!apiKey) {
        throw new Error('API key not available');
      }
      
      // Prepare the conversation history in the format expected by Gemini API
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      
      // Add the system prompt for the assistant persona
      const systemPrompt = `You are Alex, a helpful assistant representing Flowtiva. You help users with their questions about automation and AI solutions. Keep your responses concise and friendly.`;
      
      // Prepare the request payload
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: systemPrompt }]
          },
          ...formattedHistory,
          {
            role: 'user',
            parts: [{ text: message }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      };
      
      // Make the API request
      const response = await axios.post(
        `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`,
        payload
      );
      
      // Extract and return the generated text
      if (response.data && 
          response.data.candidates && 
          response.data.candidates[0] && 
          response.data.candidates[0].content && 
          response.data.candidates[0].content.parts && 
          response.data.candidates[0].content.parts[0]) {
        return response.data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected response format from Gemini API');
      }
    } catch (error) {
      console.error('Gemini API generate response error:', error);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}