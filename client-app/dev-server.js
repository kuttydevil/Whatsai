// Development server script
// This script starts the Vite development server with the correct port and host settings

const { createServer } = require('vite');
const { resolve } = require('path');

async function startServer() {
  const server = await createServer({
    // Specify the root directory
    root: resolve(__dirname),
    
    // Configure the server
    server: {
      port: 12000, // Use the assigned port
      host: '0.0.0.0', // Allow connections from any host
      cors: true, // Enable CORS
      hmr: {
        port: 12000, // Use the same port for HMR
        host: 'localhost',
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'ALLOWALL',
      },
    },
  });
  
  await server.listen();
  
  console.log(`Server running at http://localhost:12000`);
  console.log(`External URL: https://work-1-oyleozzfsuuedrbt.prod-runtime.all-hands.dev`);
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});