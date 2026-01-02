import express from 'express';
import { createMCPServer } from './server.js';
import { setupTransport } from './transport.js';
import { sessionManager } from './session/manager.js';
import { logger } from './utils/logger.js';

interface CliArgs {
  port: number;
  host: string;
  help: boolean;
  allowOnly: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || '3000', 10);
  let host = process.env.HOST || '127.0.0.1';
  let help = false;
  let allowOnly = process.env.ALLOW_ONLY || '/Users/';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
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
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Use --help to see available options');
      process.exit(1);
    }
  }

  return { port, host, help, allowOnly };
}

function showHelp(): void {
  console.log(`
flutter-ios-mcp - Model Context Protocol server for Flutter iOS development

USAGE:
  flutter-ios-mcp [OPTIONS]

OPTIONS:
  -p, --port <port>         Port to listen on (default: 3000)
      --host <host>         Host address to bind to (default: 127.0.0.1)
      --allow-only <path>   Only allow Flutter projects under this path (default: /Users/)
  -h, --help                Show this help message

ENVIRONMENT VARIABLES:
  PORT                      Port to listen on (overridden by --port)
  HOST                      Host address to bind to (overridden by --host)
  ALLOW_ONLY                Path prefix for allowed projects (overridden by --allow-only)
  LOG_LEVEL                 Logging level (debug, info, warn, error)

EXAMPLES:
  flutter-ios-mcp
  flutter-ios-mcp --port 8080
  flutter-ios-mcp --port 3000 --host localhost
  flutter-ios-mcp --allow-only /Users/alice/projects
  PORT=8080 flutter-ios-mcp

SECURITY:
  By default, only Flutter projects under /Users/ are allowed to prevent
  malicious MCP clients from accessing system directories like /etc/, /usr/, etc.

For more information, visit: https://github.com/yourusername/flutter-ios-mcp
`);
}

async function main(): Promise<void> {
  const { port, host, help, allowOnly } = parseArgs();

  if (help) {
    showHelp();
    process.exit(0);
  }

  // Configure session manager with allowed path prefix
  sessionManager.configure(allowOnly);

  const PORT = port;
  const HOST = host;
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

    await sessionManager.cleanup();
    await transport.close();

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

main().catch((error: unknown) => {
  logger.error('Fatal error', { error: String(error) });
  process.exit(1);
});
