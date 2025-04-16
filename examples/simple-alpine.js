import { app, BrowserWindow, protocol } from 'electron';
import { createSSR } from 'ssr-electron';

// Create the SSR bridge instance
const ssr = createSSR({ debug: true });

// Register protocol schemes BEFORE app is ready
ssr.registerSchemes();

function createWindow() {
  // Create the browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'ElectronSSR Alpine Example',
    webPreferences: {
      webSecurity: false, // Allow loading local resources
    },
  });

  // Load the app
  win.loadURL('http://localhost/');

  // Optional: Open DevTools for debugging
  win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

app.whenReady().then(() => {
  // Register protocol handlers AFTER app is ready
  ssr.registerHandlers();

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

    return new Response(JSON.stringify(systemInfo), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  // Setup notification example
  ssr.registerRoute(
    '/notify',
    (request, url) => {
      const message = url.searchParams.get('message') || 'Hello!';

      console.log('notify', message);

      // Use the sendMessage helper to broadcast notification
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
      <title>ElectronSSR Alpine Example</title>
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
          margin-bottom: 10px;
        }
        
        button:hover {
          background-color: #3a76d8;
        }
        
        .content-box {
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

        .search-container {
          margin-top: 20px;
        }

        input {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 100%;
          max-width: 300px;
        }

        ul {
          list-style-type: none;
          padding-left: 0;
        }

        li {
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }

        .dropdown-content {
          padding: 15px;
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
      </style>
    </head>
    <body>
      <h1>ElectronSSR Alpine Example</h1>
      
      <div x-data="{ 
        systemInfo: null, 
        loading: false,
        showInfo: false,
        fetchSystemInfo() {
          this.loading = true;
          fetch('/system-info')
            .then(response => response.json())
            .then(data => {
              this.systemInfo = data;
              this.showInfo = true;
              this.loading = false;
            })
            .catch(error => {
              console.error('Error fetching system info:', error);
              this.loading = false;
            });
        }
      }">
        <button @click="fetchSystemInfo()" x-text="loading ? 'Loading...' : 'Load System Info'"></button>
        
        <button
          @click="fetch('/notify?message=Hello from ElectronSSR!', { method: 'POST' })">
          Send Notification
        </button>

        <div class="content-box" x-show="showInfo">
          <div x-show="systemInfo">
            <h2>System Information</h2>
            <div class="info-container">
              <div class="info-item">
                <span class="info-label">Platform:</span>
                <span x-text="systemInfo?.platform"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Architecture:</span>
                <span x-text="systemInfo?.arch"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Node.js Version:</span>
                <span x-text="systemInfo?.nodeVersion"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Chromium Version:</span>
                <span x-text="systemInfo?.chromiumVersion"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Electron Version:</span>
                <span x-text="systemInfo?.electronVersion"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Process ID:</span>
                <span x-text="systemInfo?.pid"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Uptime:</span>
                <span x-text="systemInfo?.uptime ? Math.round(systemInfo.uptime) + ' seconds' : ''"></span>
              </div>
              <div class="info-item">
                <span class="info-label">Memory Usage (RSS):</span>
                <span x-text="systemInfo?.memoryUsage ? Math.round(systemInfo.memoryUsage.rss / 1024 / 1024) + ' MB' : ''"></span>
              </div>
            </div>
            <p><em>This data is fetched directly from the Electron main process using Alpine.js fetch.</em></p>
          </div>
        </div>
      </div>

      <!-- Examples from Alpine.js documentation -->
      <h2>Alpine.js Examples</h2>

      <!-- Counter Example -->
      <div class="content-box">
        <h3>Local Counter</h3>
        <div x-data="{ count: 0 }">
          <button @click="count++">Increment</button>
          <span x-text="count"></span>
        </div>
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

// Clean up SSE connections when app is about to quit
app.on('will-quit', () => {
  console.log('Cleaning up resources before quitting...');
  ssr.cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
