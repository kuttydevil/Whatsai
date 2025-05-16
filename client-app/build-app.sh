#!/bin/bash

# Build the WhatsApp Automation application

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

# Install dependencies if node_modules directory doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the WebAssembly module if Rust and wasm-pack are installed
if command -v rustc &> /dev/null && command -v wasm-pack &> /dev/null; then
    echo "Building WebAssembly module..."
    cd wasm
    wasm-pack build --target web
    cd ..
else
    echo "Rust or wasm-pack not found. Skipping WebAssembly build."
    echo "The application will use the mock WebAssembly module."
fi

# Build the application
echo "Building the application..."
npm run build

echo "Build completed successfully!"
echo "The built files are in the 'dist' directory."
echo "You can serve them using any static file server."