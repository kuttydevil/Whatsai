// Proxy Server for Gemini API
// This is an optional component to securely handle API keys server-side
// It's provided as a reference implementation for production use

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Gemini API proxy endpoint
app.post('/api/gemini/generate', async (req, res) => {
  try {
    // Get the API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    
    // Get the model and payload from the request
    const { model, payload } = req.body;
    
    if (!model || !payload) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Forward the request to the Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      payload
    );
    
    // Return the response from the Gemini API
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying request to Gemini API:', error);
    
    // Forward error response if available
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Generic error response
    res.status(500).json({ error: 'Failed to proxy request to Gemini API' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});