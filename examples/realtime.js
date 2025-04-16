import { app, BrowserWindow, protocol } from 'electron';
import { createSSR } from 'ssr-electron';
import path from 'path';
import { performance } from 'perf_hooks';

// Create the SSR bridge instance - it automatically registers schemes and handlers
const ssr = createSSR({ debug: true });

// App state for tracking metrics
const appState = {
  counter: 0,
  lastUpdate: Date.now(),
  activeConnections: 0,
  frame: 0,
  totalIncrements: 0,
  avgRenderTime: 0,
  theoreticalMaxFps: 0,
  actualFps: 0,
  lastFrameDelta: 0,
};

// Performance monitoring variables
let totalRenderTime = 0;
let lastFrameTime = performance.now();

function createWindow() {
  // Create the browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'ElectronSSR High Performance Example',
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

// Generate only the content that will be replaced
function renderMainContent() {
  return `
    <div id="main-content">
      <h2>Counter Value</h2>
      <div class="counter-value">
        ${appState.counter}
      </div>
      <button 
        id="increment-button"
        data-action="increment">
        Increment Counter (${appState.totalIncrements} clicks)
      </button>
      <div class="status">
        Frame: ${appState.frame} | 
        Active connections: ${appState.activeConnections}
      </div>
      <div class="timestamp">
        Last updated: ${new Date(appState.lastUpdate).toLocaleTimeString()}
      </div>
      
      <div class="performance">
        <h3>Server Performance</h3>
        <div>Average Render Time: ${appState.avgRenderTime.toFixed(2)}ms</div>
        <div>Theoretical Max FPS: ${appState.theoreticalMaxFps.toFixed(2)}</div>
        <div>Actual FPS: ${appState.actualFps.toFixed(2)}</div>
        <div>Last Frame Time: ${appState.lastFrameDelta.toFixed(2)}ms</div>
      </div>
    </div>
  `;
}

// Render the full page with layout and initial content
function renderFullPage() {
  const mainContent = renderMainContent();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>High Performance SSR Example</title>
      <script src="https://unpkg.com/idiomorph@0.7.3"></script>
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
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
        #app-container {
          margin: 30px 0;
          padding: 20px;
          background-color: #f0f8ff;
          border-radius: 8px;
          text-align: center;
        }
        .counter-value {
          font-size: 48px;
          font-weight: bold;
          color: #0056b3;
          margin: 20px 0;
        }
        button {
          background-color: #0056b3;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 10px 16px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        button:hover {
          background-color: #003d82;
        }
        .status {
          font-size: 12px;
          color: #666;
          margin-top: 20px;
        }
        .timestamp {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }
        .metrics {
          margin-top: 2rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 0.5rem;
        }
        .performance {
          margin-top: 1rem;
          padding: 1rem;
          background: #e6f7ff;
          border-radius: 0.5rem;
          text-align: left;
        }
        .performance h3 {
          margin-top: 0;
          margin-bottom: 10px;
        }
        .performance div {
          font-size: 14px;
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>High Performance SSR Example</h1>
        
        <div id="app-container">${mainContent}</div>
        
        <div class="metrics">
          <p>Rendering metrics:</p>
          <div>FPS: <span id="fps">0</span></div>
          <div>Frames: <span id="frames">0</span></div>
          <div>Time: <span id="time">0</span>s</div>
          <div>Increments: <span id="increments">0</span></div>
          <div>Active Connections: <span id="connections">${appState.activeConnections}</span></div>
        </div>
      </div>

      <script>
        // Metrics elements
        const appContainer = document.getElementById('app-container');
        const fpsCounter = document.getElementById('fps');
        const framesCounter = document.getElementById('frames');
        const timeCounter = document.getElementById('time');
        const incrementsCounter = document.getElementById('increments');
        const connectionsCounter = document.getElementById('connections');
        
        // Tracking variables
        let frameCount = 0;
        let startTime = Date.now();
        
        console.log('initializing client...');
        
        // Global document click handler
        document.addEventListener('click', function(event) {
          const target = event.target;
          
          // Check if the clicked element is our increment button
          if (target.id === 'increment-button' || target.dataset.action === 'increment') {
            event.preventDefault();
            console.log('Increment button clicked');
            
            // Send increment action
            fetch('/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'increment',
                timestamp: Date.now()
              })
            })
            .then(response => response.json())
            .then(data => console.log('Action processed:', data))
            .catch(error => console.error('Error sending action:', error));
          }
        });
        
        // Connect to SSE stream
        const eventSource = new EventSource('sse://stream');
        
        // Handle content updates via default message handler
        eventSource.onmessage = (event) => {
          console.log('received message:', event);
          
          // Save scroll position
          const scrollPos = window.scrollY;
          
          // Create a temporary element to hold the new HTML
          const tempContainer = document.createElement('div');
          tempContainer.innerHTML = event.data;
          
          // Use Idiomorph to merge the DOM
          Idiomorph.morph(appContainer, tempContainer.firstElementChild, {
            morphStyle: 'innerHTML',
            ignoreActiveValue: false,
            restoreFocus: true
          });
          
          // Restore scroll position
          window.scrollTo(0, scrollPos);
          
          // Update metrics
          frameCount++;
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const currentFps = Math.round(frameCount / elapsedSeconds);
          
          fpsCounter.textContent = currentFps;
          framesCounter.textContent = frameCount;
          timeCounter.textContent = elapsedSeconds.toFixed(1);
        };
        
        // Handle state updates
        eventSource.addEventListener('state-update', (event) => {
          const state = JSON.parse(event.data);
          incrementsCounter.textContent = state.totalIncrements;
          connectionsCounter.textContent = state.activeConnections;
        });
        
        // Handle connection established
        eventSource.addEventListener('connected', (event) => {
          console.log('SSE connected:', JSON.parse(event.data));
        });
        
        // Handle errors
        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err);
          
          // Try to reconnect after a delay
          setTimeout(() => {
            window.location.reload(); // Simple reconnection approach
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

  // Handle action endpoint
  ssr.registerRoute(
    '/action',
    async (request, url) => {
      // Parse JSON request body
      const text = await request.text();
      const body = JSON.parse(text);

      console.log('Action received:', body);

      // Handle the action
      if (body.action === 'increment') {
        appState.counter++;
        appState.totalIncrements++;
        appState.lastUpdate = Date.now();

        // Broadcast state update to all SSE connections
        ssr.broadcastContent('state-update', JSON.stringify(appState));
      }

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          action: body.action,
          newState: { ...appState },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    },
    'POST',
  );

  // Create the window
  createWindow();

  // Frame counting
  let frameCount = 0;
  const FRAME_RATE = 60; // Target 60fps for updates
  const FRAME_INTERVAL = 1000 / FRAME_RATE;

  // Start sending frames
  setInterval(() => {
    // Measure frame time delta
    const now = performance.now();
    const frameDelta = now - lastFrameTime;
    lastFrameTime = now;
    appState.lastFrameDelta = frameDelta;

    // Update frame count
    frameCount++;
    appState.frame = frameCount;
    appState.lastUpdate = Date.now();

    // Calculate actual FPS
    appState.actualFps = 1000 / frameDelta;

    // Measure render time
    const startRenderTime = performance.now();
    const mainContent = renderMainContent();
    const renderTime = performance.now() - startRenderTime;

    // Track render statistics
    totalRenderTime += renderTime;
    if (frameCount % 60 === 0) {
      appState.avgRenderTime = totalRenderTime / 60;
      appState.theoreticalMaxFps = 1000 / appState.avgRenderTime;
      appState.activeConnections = ssr.sseConnections.size;
      totalRenderTime = 0;

      // Log performance data
      console.log(`Performance after ${frameCount} frames:`);
      console.log(
        `- Average render time: ${appState.avgRenderTime.toFixed(2)}ms`,
      );
      console.log(`- Actual FPS: ${appState.actualFps.toFixed(2)}`);
      console.log(
        `- Theoretical max FPS: ${appState.theoreticalMaxFps.toFixed(2)}`,
      );
    }

    // Format content for SSE - split by newlines and add data: prefix
    const sseFormattedContent = mainContent
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n');

    // Send content without an event name (will be handled by onmessage)
    for (const connection of ssr.sseConnections) {
      if (!connection.stream.destroyed) {
        connection.stream.write(`${sseFormattedContent}\n\n`);

        // Also send a state update with an event name
        connection.stream.write(
          `event: state-update\ndata: ${JSON.stringify(appState)}\n\n`,
        );

        // Send a heartbeat every 30 frames to keep the connection alive
        if (frameCount % 30 === 0) {
          connection.stream.write(':\n\n'); // SSE comment as heartbeat
        }
      }
    }
  }, FRAME_INTERVAL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
