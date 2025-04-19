import { app, BrowserWindow } from 'electron';
import { createSSR } from 'ssr-electron';
import { performance } from 'perf_hooks';

// Create the SSR bridge instance
const ssr = createSSR({ debug: true });

// App state for tracking metrics
const appState = {
  lastUpdate: Date.now(),
  activeConnections: 0,
  startTime: Date.now(),
  frameCount: 0,
  fps: 0,
  lastFpsUpdate: Date.now(),
};

// Performance tracking variables
let lastFrameTime = performance.now();

// Generate a random number for display
function getRandomNumber() {
  return Math.floor(Math.random() * 1000);
}

// Functions to generate different colored divs
function renderRedDiv() {
  return `
    <div id="red-div" style="background-color: #ffdddd;" x-data="{ local: 'Red local state' }">
      <h2>Red</h2>
      <div class="value">${getRandomNumber()}</div>
      <p>${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

function renderBlueDiv() {
  return `
    <div id="blue-div" style="background-color: #ddddff;" x-data="{ local: 'Blue local state' }">
      <h2>Blue</h2>
      <div class="value">${getRandomNumber()}</div>
      <p>${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

function renderGreenDiv() {
  return `
    <div id="green-div" style="background-color: #ddffdd;" x-data="{ local: 'Green local state' }">
      <h2>Green</h2>
      <div class="value">${getRandomNumber()}</div>
      <p>${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

function renderYellowDiv() {
  return `
    <div id="yellow-div" style="background-color: #ffffdd;" x-data="{ local: 'Yellow local state' }">
      <h2>Yellow</h2>
      <div class="value">${getRandomNumber()}</div>
      <p>${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

function renderPurpleDiv() {
  return `
    <div id="purple-div" style="background-color: #ffddff;" x-data="{ local: 'Purple local state' }">
      <h2>Purple</h2>
      <div class="value">${getRandomNumber()}</div>
      <p>${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

// Array of div generator functions
const divGenerators = [
  renderRedDiv,
  renderBlueDiv,
  renderGreenDiv,
  renderYellowDiv,
  renderPurpleDiv,
];

function createWindow() {
  // Create the browser window
  const win = new BrowserWindow({
    width: 800,
    height: 800,
    title: 'AlpineJS + Morph Example',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app
  win.loadURL('http://localhost/');

  // Optional: Open DevTools for debugging
  win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

function renderFullPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>AlpineJS + SSR + Alpine Morph Example</title>
      <!-- Alpine Plugins -->
      <script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/morph@3.x.x/dist/cdn.min.js"></script>
      
      <!-- Alpine Core -->
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 1000px;
          margin: 0 auto;
          padding: 10px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        h1, h2, h3 {
          color: #333;
          margin-top: 0;
        }
        h2 {
          font-size: 18px;
          margin: 0;
        }
        #content-container {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        #red-div, #blue-div, #green-div, #yellow-div, #purple-div {
          padding: 10px;
          border-radius: 8px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }
        .value {
          font-size: 24px;
          font-weight: bold;
          color: #0056b3;
          margin: 5px 0;
        }
        p {
          margin: 5px 0;
          font-size: 12px;
        }
        .status-bar {
          background-color: #eee;
          padding: 10px;
          border-radius: 4px;
          margin-top: 20px;
          font-size: 14px;
          display: flex;
          justify-content: space-between;
        }
        .fps-display {
          font-weight: bold;
          color: #0056b3;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Realtime SSR + Alpine Morph Example</h1>
        
        <div id="content-container">
          ${renderRedDiv()}
          ${renderBlueDiv()}
          ${renderGreenDiv()}
          ${renderYellowDiv()}
          ${renderPurpleDiv()}

                <!-- Alpine.js Local Counter Card -->
      <div id="local-counter" class="local-counter" x-data="{ count: 0 }">
        <h2>Local Alpine Counter</h2>
        <div class="value" x-text="count"></div>
        <div>
          <button x-on:click="count++">Increment</button>
          <button x-on:click="count--">Decrement</button>
          <button x-on:click="count = 0">Reset</button>
        </div>
        <p class="note">This counter state is preserved during server updates thanks to Alpine's Morph plugin</p>
      </div>
        </div>
        
        <div class="status-bar">
          <div> 
            Running since: ${new Date(appState.startTime).toLocaleTimeString()}
          </div>
          <div>
            Update FPS: <span id="fps-counter" class="fps-display">0</span>
          </div>
        </div>
        
        <div class="notes">
          <h3>How it works:</h3>
          <ul>
            <li>The server randomly sends a single div update via SSE</li>
            <li>Alpine's Morph plugin intelligently merges the new div into the existing content</li>
          </ul>
        </div>
      </div>

      <script>
        // Initialize connection to SSE stream
        console.log('Initializing client...');
        
        // Get the content container that will be updated
        const contentContainer = document.getElementById('content-container');
        const fpsCounter = document.getElementById('fps-counter');
        
        // Track frames for FPS calculation
        let frameCount = 0;
        let lastFpsUpdate = Date.now();
        
        // Connect to SSE stream
        const eventSource = new EventSource('sse://stream');
        
        // Handle content updates
        eventSource.onmessage = (event) => {
          // Parse the JSON-encoded HTML content - this is a single div HTML
          const htmlContent = JSON.parse(event.data);
          
          // Create a temporary DOM element to hold the new content
          const temp = document.createElement('div');
          temp.innerHTML = htmlContent;
          const newDiv = temp.firstElementChild;
          
          // Find the matching element by ID to update
          if (newDiv && newDiv.id) {
            const targetDiv = document.getElementById(newDiv.id);
            if (targetDiv) {
              // Use Alpine.morph to update just the matching div with the same ID
              Alpine.morph(targetDiv, newDiv);
              
              // Update frame count for FPS calculation
              frameCount++;
              const now = Date.now();
              const elapsed = now - lastFpsUpdate;
              
              // Update FPS display every second
              if (elapsed > 1000) {
                const fps = Math.round((frameCount * 1000) / elapsed);
                fpsCounter.textContent = fps;
                frameCount = 0;
                lastFpsUpdate = now;
              }
            }
          }
        };
        
        // Handle connection established
        eventSource.addEventListener('connected', (event) => {
          console.log('SSE connected:', JSON.parse(event.data));
        });
        
        // Handle errors
        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err);
          
          // Try to reconnect after a delay
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        };
        
        console.log('Client initialized and ready');
      </script>
    </body>
    </html>
  `;
}

app.whenReady().then(() => {
  // Register route for the main page
  ssr.registerRoute('/', (request, url) => {
    return new Response(renderFullPage(), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  });

  // Create the window
  createWindow();

  // Update random div at interval
  const UPDATE_INTERVAL = 0.0001; // 100ms for 10 FPS

  // Start sending updates
  setInterval(() => {
    // Measure frame delta time
    const now = performance.now();
    const frameDelta = now - lastFrameTime;
    lastFrameTime = now;

    // Pick a random div generator
    const randomIndex = Math.floor(Math.random() * divGenerators.length);
    const generateRandomDiv = divGenerators[randomIndex];

    // Generate div content for a single random div
    const divContent = generateRandomDiv();

    // Update state
    appState.lastUpdate = Date.now();
    appState.activeConnections = ssr.sseConnections.size;
    appState.frameCount++;

    // Calculate FPS every second
    const fpsElapsed = Date.now() - appState.lastFpsUpdate;
    if (fpsElapsed > 1000) {
      appState.fps = Math.round((appState.frameCount * 1000) / fpsElapsed);
      appState.frameCount = 0;
      appState.lastFpsUpdate = Date.now();
    }

    // Properly escape and format data for SSE
    const jsonContent = JSON.stringify(divContent);
    const sseFormattedContent = `data: ${jsonContent}\n\n`;

    // Send to all connections
    for (const connection of ssr.sseConnections) {
      if (!connection.stream.destroyed) {
        connection.stream.write(sseFormattedContent);

        // Send a heartbeat occasionally
        if (Math.random() < 0.01) {
          connection.stream.write(':\n\n'); // SSE comment as heartbeat
        }
      }
    }
  }, UPDATE_INTERVAL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
