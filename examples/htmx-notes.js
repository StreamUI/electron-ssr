import { app, BrowserWindow, protocol, safeStorage } from 'electron';
import { createSSR } from '@electron/ssr';
import fs from 'fs/promises';
import path from 'path';

// Create the SSR bridge instance
const ssr = createSSR({ debug: true });

// The path to our encrypted notes file
const NOTES_FILE = path.join(app.getPath('userData'), 'notes.enc');

// Register protocol schemes BEFORE app is ready
ssr.registerSchemes();

function createWindow() {
  // Create the browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'ElectronSSR Notes Example',
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

app.whenReady().then(async () => {
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

  // Route to display notes
  ssr.registerRoute('/notes', async (request, url) => {
    try {
      const noteContent = await readNotes();
      return new Response(renderNotesView(noteContent), {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } catch (error) {
      console.error('Error reading notes:', error);
      return new Response(renderNotesView('', error.message), {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
  });

  // Route to save notes
  ssr.registerRoute(
    '/save-note',
    async (request, url) => {
      try {
        const formData = await request.formData();
        const noteContent = formData.get('content');
        await saveNotes(noteContent);

        // Broadcast to any connected clients that notes were updated
        ssr.broadcastContent(
          'note-updated',
          JSON.stringify({
            content: noteContent,
            timestamp: Date.now(),
          }),
        );

        return new Response(
          renderNotesView(noteContent, null, 'Notes saved successfully!'),
          {
            headers: {
              'Content-Type': 'text/html',
            },
          },
        );
      } catch (error) {
        console.error('Error saving notes:', error);
        return new Response(
          renderNotesView(formData.get('content'), error.message),
          {
            headers: {
              'Content-Type': 'text/html',
            },
            status: 500,
          },
        );
      }
    },
    'POST',
  );

  // Create the window
  createWindow();
});

// Helper function to read and decrypt notes
async function readNotes() {
  try {
    // Check if the file exists
    await fs.access(NOTES_FILE);

    // Read the encrypted content
    const encryptedContent = await fs.readFile(NOTES_FILE);

    // Decrypt and return the content
    return safeStorage.decryptString(encryptedContent);
  } catch (error) {
    // If file doesn't exist, return empty string
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

// Helper function to encrypt and save notes
async function saveNotes(content) {
  // Encrypt the content
  const encrypted = safeStorage.encryptString(content);

  // Ensure the directory exists
  const dir = path.dirname(NOTES_FILE);
  await fs.mkdir(dir, { recursive: true });

  // Write the encrypted content to the file
  await fs.writeFile(NOTES_FILE, encrypted);
}

function renderMainPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ElectronSSR Notes Example</title>
      <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" crossorigin="anonymous"></script>
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
        
        .container {
          margin-top: 20px;
        }
        
        textarea {
          width: 100%;
          height: 300px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
          font-size: 16px;
          resize: vertical;
          margin-bottom: 10px;
        }
        
        button {
          background-color: #4a86e8;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 10px 15px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        button:hover {
          background-color: #3a76d8;
        }
        
        .success-message {
          background-color: #4caf50;
          color: white;
          padding: 10px;
          border-radius: 4px;
          margin-top: 10px;
        }
        
        .error-message {
          background-color: #f44336;
          color: white;
          padding: 10px;
          border-radius: 4px;
          margin-top: 10px;
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
      </style>
    </head>
    <body>
      <h1>Secure Notes with ElectronSSR & HTMX</h1>
      
      <div id="notes-container" hx-get="/notes" hx-trigger="load">Loading notes...</div>
      
      <div id="notifications"></div>
      
      <script>
        // Connect to SSE stream for real-time updates
        const eventSource = new EventSource('sse://stream');
        
        // Handle note update events
        eventSource.addEventListener('note-updated', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.content) {
              // Show notification
              showNotification("Notes updated from another window");
              
              // Refresh the notes content
              htmx.ajax('GET', '/notes', '#notes-container');
            }
          } catch (e) {
            console.error('Error parsing note update data:', e);
          }
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
            eventSource.close();
            window.location.reload();
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

function renderNotesView(
  content = '',
  errorMessage = null,
  successMessage = null,
) {
  return `
    <div class="container">
      <form hx-post="/save-note" hx-target="#notes-container">
        <textarea name="content" placeholder="Type your notes here...">${content}</textarea>
        <div>
          <button type="submit">Save Notes</button>
        </div>
        ${
          successMessage
            ? `<div class="success-message">${successMessage}</div>`
            : ''
        }
        ${
          errorMessage
            ? `<div class="error-message">Error: ${errorMessage}</div>`
            : ''
        }
      </form>
    </div>
    <p><em>Your notes are securely encrypted using Electron's safeStorage API. They're stored in: ${NOTES_FILE}</em></p>
  `;
}

// Set up file watcher to detect external changes
app.whenReady().then(async () => {
  try {
    const { watch } = require('fs');

    // Ensure file exists before watching
    try {
      await fs.access(NOTES_FILE);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create empty file if it doesn't exist
        await saveNotes('');
      }
    }

    // Watch for file changes
    const watcher = watch(NOTES_FILE, async () => {
      try {
        const content = await readNotes();
        // Broadcast update to all clients
        ssr.broadcastContent(
          'note-updated',
          JSON.stringify({
            content: content,
            timestamp: Date.now(),
          }),
        );
      } catch (error) {
        console.error('Error reading updated notes:', error);
      }
    });

    // Clean up watcher when app quits
    app.on('will-quit', () => {
      watcher.close();
    });
  } catch (error) {
    console.error('Error setting up file watcher:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
