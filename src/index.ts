#!/usr/bin/env node
import express from 'express';
import { createMCPServer } from './server.js';
import { setupTransport } from './transport.js';
import { sessionManager } from './session/manager.js';
import { logger } from './utils/logger.js';

interface CliArgs {
  port: number;
  host: string;
  help: boolean;
  version: boolean;
  allowOnly: string;
  basePath?: string;
  maxSessions: number;
  sessionTimeout?: number;
  preBuildScript?: string;
  postBuildScript?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || '3000', 10);
  let host = process.env.HOST || '127.0.0.1';
  let help = false;
  let version = false;
  let allowOnly = process.env.ALLOW_ONLY || '/Users/';
  let basePath: string | undefined = process.env.BASE_PATH;
  let maxSessions = parseInt(process.env.MAX_SESSIONS || '10', 10);
  let sessionTimeout: number | undefined = process.env.SESSION_TIMEOUT
    ? parseInt(process.env.SESSION_TIMEOUT, 10)
    : undefined;
  let preBuildScript: string | undefined = process.env.PRE_BUILD_SCRIPT;
  let postBuildScript: string | undefined = process.env.POST_BUILD_SCRIPT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else if (arg === '--port' || arg === '-p') {
      const portValue = args[++i];
      if (!portValue || isNaN(parseInt(portValue, 10))) {
        console.error('Error: --port requires a numeric value');
        process.exit(1);
      }
      port = parseInt(portValue, 10);
    } else if (arg === '--host') {
      const hostValue = args[++i];
      if (!hostValue) {
        console.error('Error: --host requires a value');
        process.exit(1);
      }
      host = hostValue;
    } else if (arg === '--allow-only') {
      const pathValue = args[++i];
      if (!pathValue) {
        console.error('Error: --allow-only requires a path value');
        process.exit(1);
      }
      allowOnly = pathValue;
    } else if (arg === '--base-path') {
      const pathValue = args[++i];
      if (!pathValue) {
        console.error('Error: --base-path requires a path value');
        process.exit(1);
      }
      basePath = pathValue;
    } else if (arg === '--max-sessions') {
      const maxValue = args[++i];
      if (!maxValue || isNaN(parseInt(maxValue, 10))) {
        console.error('Error: --max-sessions requires a numeric value');
        process.exit(1);
      }
      maxSessions = parseInt(maxValue, 10);
      if (maxSessions < 1) {
        console.error('Error: --max-sessions must be at least 1');
        process.exit(1);
      }
    } else if (arg === '--session-timeout') {
      const timeoutValue = args[++i];
      if (!timeoutValue || isNaN(parseInt(timeoutValue, 10))) {
        console.error('Error: --session-timeout requires a numeric value (minutes)');
        process.exit(1);
      }
      sessionTimeout = parseInt(timeoutValue, 10);
      if (sessionTimeout < 1) {
        console.error('Error: --session-timeout must be at least 1 minute');
        process.exit(1);
      }
    } else if (arg === '--pre-build-script') {
      const scriptValue = args[++i];
      if (!scriptValue) {
        console.error('Error: --pre-build-script requires a command value');
        process.exit(1);
      }
      preBuildScript = scriptValue;
    } else if (arg === '--post-build-script') {
      const scriptValue = args[++i];
      if (!scriptValue) {
        console.error('Error: --post-build-script requires a command value');
        process.exit(1);
      }
      postBuildScript = scriptValue;
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Use --help to see available options');
      process.exit(1);
    }
  }

  return { port, host, help, version, allowOnly, basePath, maxSessions, sessionTimeout, preBuildScript, postBuildScript };
}

function showHelp(): void {
  console.log(`
docker-flutter-ios-simulator-mcp - MCP server for containerized Flutter iOS development

USAGE:
  docker-flutter-ios-simulator-mcp [OPTIONS]

OPTIONS:
  -p, --port <port>              Port to listen on (default: 3000)
      --host <host>              Host address to bind to (default: 127.0.0.1)
      --allow-only <path>        Only allow Flutter projects under this path (default: /Users/)
      --base-path <path>         Base path for relative worktree paths (optional)
      --max-sessions <number>    Maximum number of concurrent sessions (default: 10)
      --session-timeout <mins>   Terminate inactive sessions after N minutes (optional)
      --pre-build-script <cmd>   Command to run before flutter build/run (e.g., "git pull")
      --post-build-script <cmd>  Command to run after flutter build/run completes
  -h, --help                     Show this help message
  -v, --version                  Show version information

ENVIRONMENT VARIABLES:
  PORT                      Port to listen on (overridden by --port)
  HOST                      Host address to bind to (overridden by --host)
  ALLOW_ONLY                Path prefix for allowed projects (overridden by --allow-only)
  BASE_PATH                 Base path for relative worktree paths (overridden by --base-path)
  MAX_SESSIONS              Maximum concurrent sessions (overridden by --max-sessions)
  SESSION_TIMEOUT           Terminate inactive sessions after N minutes (overridden by --session-timeout)
  PRE_BUILD_SCRIPT          Command to run before builds (overridden by --pre-build-script)
  POST_BUILD_SCRIPT         Command to run after builds (overridden by --post-build-script)
  LOG_LEVEL                 Logging level (debug, info, warn, error)

EXAMPLES:
  docker-flutter-ios-simulator-mcp
  docker-flutter-ios-simulator-mcp --port 8080
  docker-flutter-ios-simulator-mcp --port 3000 --host localhost
  docker-flutter-ios-simulator-mcp --allow-only /Users/alice/projects
  docker-flutter-ios-simulator-mcp --base-path /Users/alice/projects
  docker-flutter-ios-simulator-mcp --max-sessions 20
  docker-flutter-ios-simulator-mcp --session-timeout 30
  docker-flutter-ios-simulator-mcp --pre-build-script "git pull" --post-build-script "echo Done"
  PORT=8080 docker-flutter-ios-simulator-mcp

SECURITY:
  By default, only Flutter projects under /Users/ are allowed to prevent
  malicious MCP clients from accessing system directories like /etc/, /usr/, etc.

For more information, visit: https://github.com/zafnz/docker-flutter-ios-simulator-mcp
`);
}

function showVersion(): void {
  console.log('docker-flutter-ios-simulator-mcp version 0.1.2');
}

async function main(): Promise<void> {
  const { port, host, help, version, allowOnly, basePath, maxSessions, sessionTimeout, preBuildScript, postBuildScript } = parseArgs();

  if (help) {
    showHelp();
    process.exit(0);
  }

  if (version) {
    showVersion();
    process.exit(0);
  }

  // Configure session manager with allowed path prefix and session limit
  sessionManager.configure(allowOnly, maxSessions, preBuildScript, postBuildScript, basePath, sessionTimeout);

  const PORT = port;
  const HOST = host;
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Error handling middleware for JSON parse errors
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (err instanceof SyntaxError && 'body' in err) {
      logger.warn('Invalid JSON in request', { error: err.message, path: req.path });
      res.status(400).json({ error: 'Invalid JSON in request body' });
      return;
    }
    next(err);
  });

  const mcpServer = createMCPServer();
  const transport = setupTransport(app);

  await mcpServer.connect(transport);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = app.listen(PORT, HOST, () => {
    logger.info('Server started', {
      host: HOST,
      port: String(PORT),
      mcpEndpoint: `http://${HOST}:${String(PORT)}/mcp`,
    });
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${String(PORT)} is already in use`);
      process.exit(1);
    } else {
      logger.error('Server error', { error: error.message });
      process.exit(1);
    }
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down server');

    // Forcefully exit after timeout to prevent hanging
    const forceExitTimeout = setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(0);
    }, 10000);

    try {
      await sessionManager.cleanup();
      await transport.close();

      server.close(() => {
        clearTimeout(forceExitTimeout);
        logger.info('Server closed');
        process.exit(0);
      });
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    shutdown().catch((error: unknown) => {
      logger.error('Fatal error during shutdown', { error: String(error) });
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown().catch((error: unknown) => {
      logger.error('Fatal error during shutdown', { error: String(error) });
      process.exit(1);
    });
  });
}

main().catch((error: unknown) => {
  logger.error('Fatal error', { error: String(error) });
  process.exit(1);
});
