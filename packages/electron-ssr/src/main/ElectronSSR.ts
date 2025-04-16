import { Protocol, protocol as electronProtocol, app } from 'electron';
import { PassThrough, Readable } from 'stream';
import {
  ElectronSSROptions,
  RouteHandler,
  SSEConnection
} from './types';

/**
 * ElectronSSR - A bridge for SSR-like functionality in Electron using HTMX and SSE
 */
export class ElectronSSR {
  private options: ElectronSSROptions;
  private initialized: boolean = false;
  private routes: Map<string, RouteHandler> = new Map();
  private _sseConnections: Set<SSEConnection> = new Set();
  private schemesRegistered: boolean = false;

  /**
   * Create a new ElectronSSR instance
   */
  constructor(options: ElectronSSROptions = {}) {
    this.options = {
      debug: false,
      httpScheme: 'http',
      sseScheme: 'sse',
      ...options
    };

    // Automatically register schemes when instance is created
    this.registerSchemes();

    // Register cleanup handler
    app.on('will-quit', () => {
      this.log('Auto cleanup triggered by app will-quit event');
      this.cleanup();
    });

    // Automatically register handlers when app is ready
    if (app.isReady()) {
      this.registerHandlers();
    } else {
      app.whenReady().then(() => {
        this.registerHandlers();
      });
    }
  }

  /**
   * Get the active SSE connections
   */
  public get sseConnections(): Set<SSEConnection> {
    return this._sseConnections;
  }

  /**
   * Log debug messages if debug is enabled
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[ElectronSSR]', ...args);
    }
  }

  /**
   * Register protocol schemes - MUST be called BEFORE app is ready
   */
  public registerSchemes(customProtocol?: Protocol): ElectronSSR {
    if (this.schemesRegistered) {
      this.log('Schemes already registered');
      return this;
    }

    const { httpScheme, sseScheme } = this.options;
    const protocolToUse = customProtocol || electronProtocol;

    this.log('Registering protocol schemes');

    // Register HTTP and SSE protocol handlers
    protocolToUse.registerSchemesAsPrivileged([
      {
        scheme: httpScheme!,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
      {
        scheme: sseScheme!,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      }
    ]);

    this.schemesRegistered = true;
    this.log('Protocol schemes registered');

    return this;
  }

  /**
   * Register protocol handlers - MUST be called AFTER app is ready
   */
  public registerHandlers(customProtocol?: Protocol): ElectronSSR {
    if (this.initialized) {
      this.log('Handlers already registered');
      return this;
    }

    if (!this.schemesRegistered) {
      this.log('Warning: registerSchemes must be called before app is ready');
    }

    const { httpScheme, sseScheme } = this.options;
    const protocolToUse = customProtocol || electronProtocol;

    this.log('Registering protocol handlers');

    // Set up protocol handlers
    protocolToUse.handle(httpScheme!, this.handleHTTP.bind(this));
    protocolToUse.handle(sseScheme!, this.handleSSE.bind(this));

    this.initialized = true;
    this.log('Protocol handlers registered');

    return this;
  }

  /**
   * Register a route for HTTP requests
   */
  public registerRoute(path: string, handler: RouteHandler, method: string = 'GET'): ElectronSSR {
    const routeKey = `${method.toUpperCase()}:${path}`;
    this.routes.set(routeKey, handler);
    this.log(`Registered route: ${routeKey}`);
    return this;
  }

  /**
   * Broadcast content to all connected SSE clients
   */
  public broadcastContent(eventName: string, content: string): ElectronSSR {
    if (this._sseConnections.size === 0) {
      return this;
    }

    // Format content for SSE
    const formattedContent = content
      .split('\n')
      .map(line => `data: ${line}`)
      .join('\n');

    for (const connection of this._sseConnections) {
      if (!connection.stream.destroyed) {
        connection.stream.write(`event: ${eventName}\n${formattedContent}\n\n`);
      }
    }

    this.log(`Broadcasted content to ${this._sseConnections.size} connections`);
    return this;
  }

  /**
   * Handle HTTP requests
   */
  private async handleHTTP(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const routeKey = `${method}:${url.pathname}`;

    this.log(`HTTP ${method} request for ${url.pathname}`);

    // Check if we have a registered route handler
    if (this.routes.has(routeKey)) {
      try {
        const handler = this.routes.get(routeKey)!;
        return await handler(request, url);
      } catch (error) {
        this.log('Error handling route:', error);
        return new Response(`Server Error: ${(error as Error).message}`, { status: 500 });
      }
    }

    // Return 404 for unhandled routes
    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle SSE connections
   */
  private handleSSE(request: Request): Response {
    this.log('New SSE connection');

    const stream = new PassThrough();

    // SSE headers
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Add this connection to active connections
    const connection = { stream, request };
    this._sseConnections.add(connection);

    // Send initial connection established message
    stream.write('event: connected\ndata: {"status": "connected"}\n\n');

    // Remove connection when closed
    request.signal.addEventListener('abort', () => {
      this._sseConnections.delete(connection);
      stream.end();
      this.log('SSE connection closed, active connections:', this._sseConnections.size);
    });

    // Convert Node.js stream to web ReadableStream
    const webStream = Readable.toWeb(stream);

    // Return a standard web Response with the stream
    return new Response(webStream as unknown as BodyInit, { headers });
  }

  /**
   * Create a datastar connection event (required for datastar connections)
   */
  public datastarConnected(): string {
    return 'event: datastar-connected\ndata: {"status": "connected"}\n\n';
  }

  /**
   * Create a datastar-compatible SSE event for merging signals
   */
  public datastarMergeSignals(signals: Record<string, any>): string {
    return `event: datastar-merge-signals\ndata: signals ${JSON.stringify(signals)}\n\n`;
  }

  /**
   * Create a datastar-compatible DOM fragment update
   */
  public datastarMergeFragments(selector: string, html: string, mergeMode: string = 'inner'): string {
    return [
      'event: datastar-merge-fragments',
      `data: selector ${selector}`,
      `data: mergeMode ${mergeMode}`,
      `data: fragments ${html.replace(/\n/g, '')}`
    ].join('\n') + '\n\n';
  }

  /**
   * Create a datastar-compatible script execution event
   */
  public datastarExecuteScript(script: string, autoRemove: boolean = true): string {
    // Split the script into lines for proper formatting
    const scriptLines = script.trim().split('\n');

    let output = 'event: datastar-execute-script\n';
    output += `data: autoRemove ${autoRemove}\n`;

    // Add each line of the script with 'data: script ' prefix
    for (const line of scriptLines) {
      output += `data: script ${line.trim()}\n`;
    }

    // End with double newline
    output += '\n';

    return output;
  }

  /**
   * Create a datastar-compatible SSE event for removing signals
   */
  public datastarRemoveSignals(paths: string | string[]): string {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    return [
      'event: datastar-remove-signals',
      ...pathsArray.map(path => `data: paths ${path}`)
    ].join('\n') + '\n\n';
  }

  /**
   * Create a datastar-compatible SSE event for removing fragments
   */
  public datastarRemoveFragments(selector: string): string {
    return [
      'event: datastar-remove-fragments',
      `data: selector ${selector}`
    ].join('\n') + '\n\n';
  }

  /**
   * Clean up all SSE connections and resources
   * Should be called when the app is about to quit
   */
  public cleanup(): void {
    this.log('Cleaning up SSE connections');

    if (this._sseConnections.size > 0) {
      // Close all active SSE connections
      for (const connection of this._sseConnections) {
        if (!connection.stream.destroyed) {
          connection.stream.end();
        }
      }

      // Clear the connections set
      this._sseConnections.clear();
    }

    this.log('Cleanup complete');
  }
} 