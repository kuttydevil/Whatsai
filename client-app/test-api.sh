#!/bin/bash

# Test the Gemini API integration

# Check if an API key was provided
if [ -z "$1" ]; then
  echo "Please provide your Gemini API key as an argument"
  echo "Usage: ./test-api.sh YOUR_API_KEY"
  exit 1
fi

# Run the test script
node test-gemini-api.js "$1"