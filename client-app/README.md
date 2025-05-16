# WhatsApp Automation with WebAssembly

A fully client-side web application that performs web automation tasks (specifically WhatsApp Web) using WebAssembly (WASM) for performance-critical operations. The app integrates with the Gemini API for AI-powered responses.

## Features

- **Fully Client-Side**: Runs entirely in the browser without server-side components
- **WebAssembly Integration**: Uses Rust compiled to WebAssembly for performance-intensive tasks
- **Gemini API Integration**: Connects to the Gemini API for AI-powered responses
- **WhatsApp Web Automation**: Monitors for new messages and responds automatically
- **Secure API Key Handling**: Stores API keys in memory only during runtime

## Technology Stack

- **Frontend**: JavaScript/HTML/CSS with Bootstrap for styling
- **WebAssembly**: Rust compiled to WebAssembly using wasm-bindgen
- **API Integration**: Axios for HTTP requests to the Gemini API
- **Build Tool**: Vite for fast development and optimized production builds

## Security Considerations

### API Key Handling

The application handles the Gemini API key securely by:

1. **Memory-Only Storage**: The API key is stored in memory only during runtime and is never persisted to disk
2. **Clearing on Exit**: The API key is cleared when the application is closed or refreshed
3. **Input Clearing**: The API key input field is cleared after the key is stored in memory
4. **No Local Storage**: The API key is never stored in localStorage, sessionStorage, or cookies

### Limitations and Recommendations

While the application takes steps to handle the API key securely, there are inherent limitations to client-side security:

1. **Client-Side Exposure**: Any API key used directly from the browser is potentially visible to users who inspect network traffic
2. **Recommended Alternative**: For production use, implement a secure proxy server that handles API requests and keeps the API key server-side
3. **Rate Limiting**: Consider implementing rate limiting on the Gemini API key to prevent abuse

## Setup and Installation

### Prerequisites

- Node.js (v16 or later)
- Rust and Cargo (for WebAssembly compilation)
- wasm-pack (for building the Rust WebAssembly module)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/whatsapp-automation.git
   cd whatsapp-automation
   ```

2. Install JavaScript dependencies:
   ```
   cd client-app
   npm install
   ```

3. Build the WebAssembly module:
   ```
   cd wasm
   wasm-pack build --target web
   ```

4. Start the application using the provided script:
   ```
   cd ..
   ./start-app.sh
   ```

5. Open your browser and navigate to `http://localhost:12000`

### Helper Scripts

The application includes several helper scripts:

- `start-app.sh`: Starts the application in development mode
- `start-proxy.sh`: Starts the proxy server for secure API key handling
- `test-api.sh`: Tests the Gemini API integration
- `build-wasm.sh`: Builds the WebAssembly module from Rust source
- `build-app.sh`: Builds the entire application for production

## Usage

1. Enter your Gemini API key in the configuration panel
2. Set the polling interval (how often to check for new messages)
3. Enable or disable AI responses
4. Click "Start Automation" to begin
5. The WhatsApp Web interface will open in the preview panel
6. Scan the QR code with your phone to log in to WhatsApp Web
7. The automation will monitor for new messages and respond automatically if AI responses are enabled

### Testing the Gemini API

Before starting the automation, you can test your Gemini API key:

1. Using the API test page:
   ```
   http://localhost:12000/api-test.html
   ```

2. Using the command-line test script:
   ```
   ./test-api.sh YOUR_API_KEY
   ```

This will verify that your API key is valid and that the application can communicate with the Gemini API.

## Building for Production

To build the application for production, use the provided build script:

```
./build-app.sh
```

This script will:
1. Install dependencies if needed
2. Build the WebAssembly module if Rust and wasm-pack are installed
3. Build the application using Vite

Alternatively, you can build manually:

```
# Build WebAssembly module (if Rust is installed)
cd wasm
wasm-pack build --target web
cd ..

# Build the application
npm run build
```

The built files will be in the `dist` directory and can be served by any static file server.

## License

This project is licensed under the MIT License - see the LICENSE file for details.