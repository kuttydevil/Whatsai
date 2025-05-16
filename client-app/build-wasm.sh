#!/bin/bash

# Build the WebAssembly module
cd wasm
wasm-pack build --target web
cd ..

# Copy the generated files to the public directory
mkdir -p public
cp -r wasm/pkg/* public/

echo "WebAssembly module built successfully!"