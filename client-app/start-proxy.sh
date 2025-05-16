#!/bin/bash

# Start the proxy server

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js to continue."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm to continue."
    exit 1
fi

# Change to the proxy server directory
cd proxy-server

# Install dependencies if node_modules directory doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing proxy server dependencies..."
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit the .env file to add your Gemini API key."
    exit 1
fi

# Start the proxy server
echo "Starting proxy server..."
npm start