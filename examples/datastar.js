import { app, BrowserWindow, protocol } from 'electron';
import { createSSR } from 'ssr-electron';
import { PassThrough, Readable } from 'stream';

// Create the SSR bridge instance - it automatically registers schemes and handlers
const ssr = createSSR({ debug: true });

// App state
const appState = {
  counter: 0,
  lastUpdate: Date.now(),
  activeConnections: 0,
};

/**
 * Helper function to broadcast updates to all connections
 */
function broadcastToAllConnections(signalData, fragmentData = null) {
  let count = 0;

  // Loop through all active SSE connections
  for (const connection of ssr.sseConnections) {
    if (!connection.stream.destroyed) {
      // Send signals update
      connection.stream.write(signalData);

      // Send fragment update if provided
      if (fragmentData) {
        connection.stream.write(fragmentData);
      }
      count++;
    }
  }

  console.log(`Broadcast sent to ${count} connections`);
  return count;
}

// Function to create the main window
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Datastar in Electron',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL('http://localhost/');

  // Optional: Open DevTools for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// Initialize when app is ready
app.whenReady().then(() => {
  // Register route for the main page
  ssr.registerRoute('/', (request, url) => {
    const html = renderBasicPage();

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  });

  // Handle increments
  ssr.registerRoute(
    '/increment',
    (request, url) => {
      if (request.method === 'POST') {
        appState.counter++;
        appState.lastUpdate = Date.now();

        console.log('Counter incremented to:', appState.counter);

        // Create a PassThrough stream for the response
        const stream = new PassThrough();
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // In Datastar, the response to a post action must be an SSE stream
        // with at least one event, so we send the updated signal
        const signalData = ssr.datastarMergeSignals({
          counter: appState.counter,
        });

        // Create fragment update
        const fragmentData = ssr.datastarMergeFragments(
          '#status-message',
          `<p>Counter was updated to <strong>${
            appState.counter
          }</strong> at ${new Date().toLocaleTimeString()}</p>`,
          'inner',
        );

        // Write to response stream
        stream.write(signalData);
        stream.write(fragmentData);

        // Also broadcast to all other connections
        broadcastToAllConnections(signalData, fragmentData);

        // Return SSE response
        const webStream = Readable.toWeb(stream);
        return new Response(webStream, { headers });
      }
    },
    'POST',
  );

  // Handle reset
  ssr.registerRoute(
    '/reset',
    (request, url) => {
      if (request.method === 'POST') {
        appState.counter = 0;
        appState.lastUpdate = Date.now();

        console.log('Counter reset to:', appState.counter);

        // Create a PassThrough stream for the response
        const stream = new PassThrough();
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Send the updated signal using proper format
        const signalData = ssr.datastarMergeSignals({
          counter: appState.counter,
        });

        // Create fragment update
        const fragmentData = ssr.datastarMergeFragments(
          '#status-message',
          `<p>Counter was reset to <strong>${
            appState.counter
          }</strong> at ${new Date().toLocaleTimeString()}</p>`,
          'inner',
        );

        // Write to response stream
        stream.write(signalData);
        stream.write(fragmentData);

        // Also broadcast to all other connections
        broadcastToAllConnections(signalData, fragmentData);

        // Return SSE response
        const webStream = Readable.toWeb(stream);
        return new Response(webStream, { headers });
      }
    },
    'POST',
  );

  // Handle SSE updates
  ssr.registerRoute('/updates', (request, url) => {
    // For datastar, we need to use a specific format
    const stream = new PassThrough();
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Track connection count
    appState.activeConnections++;
    console.log(
      `New connection. Active connections: ${appState.activeConnections}`,
    );

    // Send initial connection event with proper datastar format
    stream.write(ssr.datastarConnected());

    // Send initial signals
    stream.write(
      ssr.datastarMergeSignals({
        counter: appState.counter,
        time: new Date().toLocaleTimeString(),
        connections: appState.activeConnections,
      }),
    );

    // Update time every second
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString();

      // Use signal updates with proper datastar format
      stream.write(
        ssr.datastarMergeSignals({
          time: now,
        }),
      );
    }, 1000);

    // Clean up on abort
    request.signal.addEventListener('abort', () => {
      clearInterval(interval);
      appState.activeConnections--;
      console.log(
        `Connection closed. Active connections: ${appState.activeConnections}`,
      );
      stream.end();
    });

    // Return SSE response
    const webStream = Readable.toWeb(stream);
    return new Response(webStream, { headers });
  });

  // Handle update message button
  ssr.registerRoute(
    '/update-message',
    (request, url) => {
      if (request.method === 'POST') {
        console.log('Updating status message');

        // Create a PassThrough stream for the response
        const stream = new PassThrough();
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Update the DOM with a new message
        stream.write(
          ssr.datastarMergeFragments(
            '#status-message',
            `<p>Status message updated at ${new Date().toLocaleTimeString()}</p>`,
            'inner',
          ),
        );

        // Return SSE response
        const webStream = Readable.toWeb(stream);
        return new Response(webStream, { headers });
      }
    },
    'POST',
  );

  // Handle execute script example
  ssr.registerRoute(
    '/run-script',
    (request, url) => {
      if (request.method === 'POST') {
        console.log('Running client-side JavaScript');

        // Create a PassThrough stream for the response
        const stream = new PassThrough();
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Execute a script on the client-side using the improved ssr.datastarExecuteScript method
        const script = `
				const now = new Date().toLocaleTimeString();
				document.querySelector("#status-message").innerHTML = \`<p>Script executed at \${now}</p>\`;
				console.log("Script executed from server at " + now);
				`;

        stream.write(ssr.datastarExecuteScript(script));

        // Return SSE response
        const webStream = Readable.toWeb(stream);
        return new Response(webStream, { headers });
      }
    },
    'POST',
  );

  // Create the window
  createWindow();
});

// Render the basic HTML page (datastar format)
function renderBasicPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Datastar Example</title>
      <script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-beta.11/bundles/datastar.js"></script>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
        }
        
        h1 {
          color: #333;
          margin-bottom: 20px;
        }
        
        button {
          background-color: #4a86e8;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 10px 15px;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-right: 10px;
          margin-bottom: 10px;
        }
        
        button:hover {
          background-color: #3a76d8;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        .counter {
          font-size: 3rem;
          font-weight: bold;
          color: #4a86e8;
          margin: 20px 0;
        }
        
        .card {
          margin-top: 20px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
        }
        
        .loading {
          opacity: 0.5;
          pointer-events: none;
        }
        
        .time {
          font-style: italic;
          color: #666;
        }

        input[type="text"] {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 100%;
          margin-bottom: 10px;
          font-size: 16px;
        }
        
        .connections {
          font-size: 0.9rem;
          color: #666;
          margin-top: 20px;
          text-align: right;
        }
      </style>
    </head>
    <body data-signals='{"counter": ${
      appState.counter
    }, "time": "${new Date().toLocaleTimeString()}", "connections": ${
    appState.activeConnections
  }}'>
      <h1>Datastar in Electron</h1>
      
      <div class="card">
        <div class="counter" data-text="$counter">${appState.counter}</div>
        
        <button 
          data-on-click="@post('/increment')"
          data-indicator="loading">
          Increment Counter
        </button>
        
        <button 
          data-on-click="$counter = 0; @post('/reset')"
          data-attr-disabled="$counter == 0">
          Reset Counter
        </button>
        
        <div data-show="$loading">Processing...</div>
      </div>
      
      <div class="card">
        <p class="time">
          Current time: <span data-text="$time">${new Date().toLocaleTimeString()}</span>
        </p>
        
        <div id="status-message">
          <p>Status will update when counter changes</p>
        </div>
        
        <button data-on-click="@post('/update-message')">Update Status Message</button>
        <button data-on-click="@post('/run-script')">Run JavaScript</button>
        
        <p class="connections">
          Active connections: <span data-text="$connections">${
            appState.activeConnections
          }</span>
        </p>
      </div>
      
      <div data-on-load="@get('/updates')"></div>
    </body>
    </html>
  `;
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Re-create window on activation (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
