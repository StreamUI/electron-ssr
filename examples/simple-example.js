import { app, BrowserWindow, protocol } from 'electron';
import { createSSR } from 'ssr-electron';

// Create the SSR bridge instance - it automatically registers schemes and handlers
const ssr = createSSR({ debug: true });

function createWindow() {
  // Create the browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'ElectronSSR Simple Example',
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

app.whenReady().then(() => {
  // Register route for the main page
  ssr.registerRoute('/', (request, url) => {
    return new Response(renderMainPage(), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  });

  // Register route for system info
  ssr.registerRoute('/system-info', (request, url) => {
    // This data is only available in the main process
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      chromiumVersion: process.versions.chrome,
      electronVersion: process.versions.electron,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      pid: process.pid,
    };

    return new Response(renderSystemInfo(systemInfo), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  });

  // Setup SSE notification example
  ssr.registerRoute(
    '/notify',
    (request, url) => {
      const message = url.searchParams.get('message') || 'Hello!';

      console.log('notify', message);

      // Use the sendMessage helper to broadcast notification
      // sendMessage("notification", { message, timestamp: Date.now() });
      ssr.broadcastContent(
        'notification',
        JSON.stringify({ message, timestamp: Date.now() }),
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    'POST',
  );

  // Create the window
  createWindow();
});

function renderMainPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ElectronSSR Simple Example</title>
      <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" crossorigin="anonymous"></script>
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>
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
        }
        
        button:hover {
          background-color: #3a76d8;
        }
        
        #content {
          margin-top: 20px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
        }
        
        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 15px 20px;
          background-color: #4caf50;
          color: white;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          transition: transform 0.3s, opacity 0.3s;
          transform: translateY(-100px);
          opacity: 0;
        }
        
        .notification.show {
          transform: translateY(0);
          opacity: 1;
        }
        
        .info-item {
          display: flex;
          margin-bottom: 10px;
        }
        
        .info-label {
          font-weight: bold;
          width: 180px;
        }
      </style>
    </head>
    <body>
      <h1>ElectronSSR Simple Example w/ HTMX</h1>
      
      <div x-data="{ loading: false }">
        <button
          hx-get="/system-info"
          hx-target="#content"
          @click="loading = true"
          @htmx:afterOnLoad="loading = false">
          Load System Info
        </button>
        
        <button
          hx-post="/notify?message=Hello from ElectronSSR!"
          hx-swap="none">
          Send Notification
        </button>
      </div>
      
      <div id="content">
        <p>Click the buttons above to interact with the Electron main process:</p>
        <ul>
          <li><strong>Load System Info</strong> - Fetch system information from the main process</li>
          <li><strong>Send Notification</strong> - Broadcast a notification to all connected clients</li>
        </ul>
      </div>
      
      <div id="notifications"></div>
      
      <script>
        // Connect to SSE stream
        const eventSource = new EventSource('sse://stream');
        
        // Handle notification events
        eventSource.addEventListener('notification', (event) => {
          try {
            const data = JSON.parse(event.data);
            showNotification(data.message);
          } catch (e) {
            console.error('Error parsing notification data:', e);
          }
        });
        
        // Handle connection established
        eventSource.addEventListener('connected', (event) => {
          console.log('SSE connected:', JSON.parse(event.data));
        });
        
        // Handle regular messages
        eventSource.onmessage = (event) => {
          console.log('Received message:', event);
        };
        
        // Handle errors
        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err);
          
          // Try to reconnect after a delay
          setTimeout(() => {
            window.location.reload(); // Simple reconnection approach
          }, 2000);
        };
        
        function showNotification(message) {
          const notification = document.createElement('div');
          notification.className = 'notification';
          notification.textContent = message;
          
          document.body.appendChild(notification);
          
          // Trigger reflow
          notification.offsetHeight;
          
          // Show notification
          notification.classList.add('show');
          
          // Remove after delay
          setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
          }, 3000);
        }
      </script>
    </body>
    </html>
  `;
}

function renderSystemInfo(info) {
  return `
    <h2>System Information</h2>
    <div class="info-container">
      <div class="info-item">
        <span class="info-label">Platform:</span>
        <span>${info.platform}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Architecture:</span>
        <span>${info.arch}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Node.js Version:</span>
        <span>${info.nodeVersion}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Chromium Version:</span>
        <span>${info.chromiumVersion}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Electron Version:</span>
        <span>${info.electronVersion}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Process ID:</span>
        <span>${info.pid}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Uptime:</span>
        <span>${Math.round(info.uptime)} seconds</span>
      </div>
      <div class="info-item">
        <span class="info-label">Memory Usage (RSS):</span>
        <span>${Math.round(info.memoryUsage.rss / 1024 / 1024)} MB</span>
      </div>
    </div>
    <p><em>This data is fetched directly from the Electron main process using HTMX.</em></p>
  `;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
