# Electron SSR

## Avoid the electron IPC using SSR instead (with HTMX, AlpineJS or Datastar)


## Get started right away

### Setup

```bash
# Install dependencies
npm install @electron/ssr
```

### Simple Example

```javascript
// main.js
import { app, BrowserWindow } from 'electron';
import { createSSR } from '@electron/ssr';

// Create the SSR bridge instance
const ssr = createSSR({ debug: true });

// Register protocol schemes BEFORE app is ready
ssr.registerSchemes();

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      webSecurity: false, // Allow loading local resources
    },
  });

  // Load the app from the virtual URL
  win.loadURL('http://localhost/');
  
  return win;
}

app.whenReady().then(() => {
  // Register protocol handlers AFTER app is ready
  ssr.registerHandlers();

  // Register route for the main page
  ssr.registerRoute('/', (request, url) => {
    // HTML is generated and served directly from the main process
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Electron SSR Example</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          button {
            background-color: #4a86e8;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 10px 15px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <h1>Electron SSR Example</h1>
        <button
          hx-get="/system-info"
          hx-target="#content">
          Load System Info
        </button>
        <div id="content">
          <p>Click the button to load data from the main process</p>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  });

  // Register route for system info
  ssr.registerRoute('/system-info', (request, url) => {
    // This data is only available in the main process
    return new Response(`
      <div>
        <h2>System Information</h2>
        <ul>
          <li>Platform: ${process.platform}</li>
          <li>Architecture: ${process.arch}</li>
          <li>Node.js Version: ${process.version}</li>
          <li>Electron Version: ${process.versions.electron}</li>
        </ul>
        <p><em>This data comes directly from the Electron main process!</em></p>
      </div>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  });

  createWindow();
});

// Clean up resources when app is about to quit
app.on('will-quit', () => {
  ssr.cleanup();
});
```

### The struggle with Electron IPC

If you've built an Electron app, you're familiar with the pain of IPC (Inter-Process Communication). The main and renderer processes are completely isolated, forcing developers to set up complex messaging systems just to share data and trigger actions across the boundary. This results in:

- Verbose boilerplate code for sending and receiving messages
- Complex state synchronization between processes
- Error-prone message handling
- Type safety challenges across the boundary

### Existing solutions

Several projects make working with IPC slightly more fun:

- [electron-trpc](https://github.com/jsonnull/electron-trpc) - Uses tRPC to create type-safe APIs across the IPC boundary
- [zubridge](https://github.com/goosewobbler/zubridge) - Brings Zustand state management across the IPC boundary
- I even played around with re-building the above with Effect.ts which was quite nice.

I wanted something simpler.

### A different approach: Server-Side Rendering in Electron

I stumbled upon this article in my rabbit hole:  [The ultimate Electron app with Next.js and React Server Components](https://medium.com/@kirill_konshin/the-ultimate-electron-app-with-next-js-and-react-server-components-40742c055fb0). I ended up not going this direction as I deeply dislike NextJS, but later I stumbled upon Datastar and HTMX and remembered this article and I wondered if I could adapt the idea to work with HTMX / Datastar instead. Potentially I could get this working with just bare React 🤔

The result is Electron SSR - a library that lets you use server-side rendering patterns directly in your Electron app without dealing with IPC.

## Why Electron SSR?

The biggest advantage of Electron SSR is that it allows you to **return views from the main process that have direct access to Node.js modules** that are normally unavailable in the renderer.

### Direct access to native modules

With traditional Electron development, if you want to use Node.js modules in your renderer or access data from the main process, you need to:

1. Create a preload script to safely expose main process functionality
2. Set up contextBridge to define the API that will be available in the renderer
3. Create IPC channels for each type of communication needed
4. Set up handlers in the main process for each channel
5. Call these exposed IPC methods from the renderer
6. Parse and handle the responses
7. Update your UI accordingly

This requires careful coordination between multiple files and introduces complexity:

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  readNote: () => ipcRenderer.invoke('read-note'),
  saveNote: (content) => ipcRenderer.invoke('save-note', content)
})

// main.js
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const fs = require('fs/promises')

ipcMain.handle('read-note', async () => {
  try {
    const encryptedContent = await fs.readFile('user-notes.enc')
    return await safeStorage.decryptString(encryptedContent)
  } catch (error) {
    return { error: error.message }
  }
})

ipcMain.handle('save-note', async (event, content) => {
  try {
    const encrypted = await safeStorage.encryptString(content)
    await fs.writeFile('user-notes.enc', encrypted)
    return { success: true }
  } catch (error) {
    return { error: error.message }
  }
})

// renderer.js
document.getElementById('load-button').addEventListener('click', async () => {
  const content = await window.electronAPI.readNote()
  if (content.error) {
    document.getElementById('note-container').innerText = `Error: ${content.error}`
  } else {
    document.getElementById('note-container').innerText = content
  }
})

document.getElementById('save-button').addEventListener('click', async () => {
  const content = document.getElementById('note-input').value
  const result = await window.electronAPI.saveNote(content)
  if (result.error) {
    alert(`Failed to save: ${result.error}`)
  } else {
    alert('Saved successfully!')
  }
})
```

With Electron SSR, you can simply define a route handler that:

1. Directly accesses Node.js modules and Electron APIs
2. Returns HTML with the results already integrated
3. The renderer just makes a request and gets the rendered result

Here's an example with HTMX:

```javascript
// In your main process setup
import { ElectronSSR } from 'electron-ssr';
import fs from 'fs/promises';
import { safeStorage } from 'electron';

const ssr = new ElectronSSR();

// Register a route that reads a file and returns its content
ssr.registerRoute('/notes', async (request, url) => {
  try {
    // Access Node.js modules directly
    const encryptedContent = await fs.readFile('user-notes.enc');
    const content = await safeStorage.decryptString(encryptedContent);
    
    // Return HTML with the content already integrated
    return new Response(`
      <div id="notes-container">
        <h1>Your Notes</h1>
        <div class="note-content">${content}</div>
        <button hx-post="/save-note" hx-target="#notes-container">Save</button>
      </div>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    return new Response(`<div>Error: ${error.message}</div>`, { status: 500 });
  }
});

// Handle saving notes
ssr.registerRoute('/save-note', async (request, url) => {
  // Get form data from the request
  const formData = await request.formData();
  const noteContent = formData.get('content');
  
  // Encrypt and save to filesystem
  const encrypted = await safeStorage.encryptString(noteContent);
  await fs.writeFile('user-notes.enc', encrypted);
  
  // Return updated UI
  return new Response(`
    <div id="notes-container">
      <h1>Your Notes</h1>
      <div class="note-content">${noteContent}</div>
      <button hx-post="/save-note" hx-target="#notes-container">Save</button>
      <div class="success-message">Saved successfully!</div>
    </div>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}, 'POST');
```

In your renderer, the code is pure HTML and HTMX - no IPC needed:

```html
<body>
  <div id="app">
    <div hx-get="/notes" hx-trigger="load">Loading...</div>
  </div>
  
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</body>
```

### Real-time updates with SSE

Electron SSR also supports Server-Sent Events, making it easy to push updates from the main process to the renderer:

```javascript
// In main process
import { watch } from 'fs';

// Set up file watcher
watch('user-notes.enc', () => {
  // When file changes, broadcast to all clients
  ssr.broadcastContent('note-updated', `
    <div class="note-content">${decryptedContent}</div>
  `);
});

// In renderer
<div hx-sse="connect:sse://events">
  <div hx-sse="swap:note-updated" id="note-content">
    Initial content
  </div>
</div>
```

This approach completely eliminates the need to manually handle IPC communication, making your Electron apps feel more like traditional web development while still leveraging the full power of Node.js and native modules.

## How it works

Electron SSR works by:

1. Registering custom protocol handlers in Electron
2. Creating a virtual "server" that runs in the main process
3. Handling HTTP-like requests from the renderer
4. Supporting Server-Sent Events (SSE) for real-time updates
5. Integrating seamlessly with HTMX and Datastar

Essentially, it turns your main process into a server that your renderer can communicate with using standard web protocols, **without actually running a server or opening any ports**.

## Features

- Register [HTTP routes and handle requests directly in Electron](https://www.electronjs.org/docs/latest/api/protocol)
- Handle Server-Sent Events (SSE) for real-time updates
- Broadcast updates to clients
- Support for HTMX and Datastar-compatible events and responses
- No traditional server needed
- No direct IPC calls needed from your application code

## Examples


See the `examples` directory for complete examples:

- `simple-example.js` - Basic example with HTMX and Alpine.js
- `simple-alpine.js` - Basic example, but using only AlpineJS
- `htmx-notes.js` - Example with realtime synced secure notes
- `datastar.js` - Example using Datastar


### Contributing

I just started playing around with HTMX and Datastar, and am by no means a Electron export, so feel free to submit updates or more examples to show off the power!

## License

MIT
