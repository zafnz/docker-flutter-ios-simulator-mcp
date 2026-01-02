import express from 'express';
import { createMCPServer } from './server.js';
import { setupTransport } from './transport.js';
import { sessionManager } from './session/manager.js';
import { logger } from './utils/logger.js';

interface CliArgs {
  port: number;
  host: string;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || '3000', 10);
  let host = process.env.HOST || '0.0.0.0';
  let help = false;

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
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Use --help to see available options');
      process.exit(1);
    }
  }

  return { port, host, help };
}

function showHelp(): void {
  console.log(`
flutter-ios-mcp - Model Context Protocol server for Flutter iOS development

USAGE:
  flutter-ios-mcp [OPTIONS]

OPTIONS:
  -p, --port <port>    Port to listen on (default: 3000)
      --host <host>    Host address to bind to (default: 0.0.0.0)
  -h, --help           Show this help message

ENVIRONMENT VARIABLES:
  PORT                 Port to listen on (overridden by --port)
  HOST                 Host address to bind to (overridden by --host)
  LOG_LEVEL            Logging level (debug, info, warn, error)

EXAMPLES:
  flutter-ios-mcp
  flutter-ios-mcp --port 8080
  flutter-ios-mcp --port 3000 --host localhost
  PORT=8080 flutter-ios-mcp

For more information, visit: https://github.com/yourusername/flutter-ios-mcp
`);
}

async function main(): Promise<void> {
  const { port, host, help } = parseArgs();

  if (help) {
    showHelp();
    process.exit(0);
  }

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
      logger.error(`Port ${PORT} is already in use`);
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
