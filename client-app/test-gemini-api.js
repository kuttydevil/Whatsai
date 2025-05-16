// Test script for Gemini API
// Run with: node test-gemini-api.js YOUR_API_KEY

import axios from 'axios';

// Simple function to test the Gemini API
async function testGeminiApi(apiKey) {
  if (!apiKey) {
    console.error('Please provide an API key as a command line argument');
    console.error('Usage: node test-gemini-api.js YOUR_API_KEY');
    process.exit(1);
  }

  console.log('Testing Gemini API connection...');

  try {
    // Test the API connection
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    const model = 'gemini-1.5-flash';

    // First, test the connection by listing models
    console.log('Fetching available models...');
    const modelsResponse = await axios.get(`${baseUrl}?key=${apiKey}`);
    
    if (modelsResponse.status !== 200) {
      throw new Error(`API returned status ${modelsResponse.status}`);
    }
    
    console.log('API connection successful!');
    console.log(`Available models: ${modelsResponse.data.models.length}`);
    
    // Now, test generating content
    console.log('\nTesting content generation...');
    const message = 'Hello, can you help me with WhatsApp automation?';
    
    const payload = {
      contents: [
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
      }
    };
    
    const generateResponse = await axios.post(
      `${baseUrl}/${model}:generateContent?key=${apiKey}`,
      payload
    );
    
    if (generateResponse.status !== 200) {
      throw new Error(`API returned status ${generateResponse.status}`);
    }
    
    // Extract the generated text
    const generatedText = generateResponse.data.candidates[0].content.parts[0].text;
    
    console.log('Content generation successful!');
    console.log('\nGenerated response:');
    console.log('-------------------');
    console.log(generatedText);
    console.log('-------------------');
    
    console.log('\nAPI test completed successfully!');
  } catch (error) {
    console.error('API test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Get the API key from command line arguments
const apiKey = process.argv[2];
testGeminiApi(apiKey);