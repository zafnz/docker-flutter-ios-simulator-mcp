import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  sessionStartSchema,
  sessionEndSchema,
  handleSessionStart,
  handleSessionEnd,
  handleSessionList,
} from './session.js';
import { handleSimulatorList } from './simulator.js';
import {
  flutterRunSchema,
  flutterCommandSchema,
  flutterLogsSchema,
  handleFlutterRun,
  handleFlutterStop,
  handleFlutterHotReload,
  handleFlutterHotRestart,
  handleFlutterLogs,
} from './flutter-commands.js';
import {
  uiTapSchema,
  uiTypeSchema,
  uiSwipeSchema,
  uiDescribeAllSchema,
  uiDescribePointSchema,
  screenshotSchema,
  handleUiTap,
  handleUiType,
  handleUiSwipe,
  handleUiDescribeAll,
  handleUiDescribePoint,
  handleScreenshot,
} from './simulator-ui.js';
import { logger } from '../utils/logger.js';

export function registerTools(mcpServer: McpServer): void {
  const server = mcpServer.server;

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'session_start',
        description:
          'Create a new session with a git worktree path and boot a new iOS simulator. Returns session ID and simulator UDID.',
        inputSchema: {
          type: 'object',
          properties: {
            worktreePath: {
              type: 'string',
              description: 'Path to the git worktree directory',
            },
            deviceType: {
              type: 'string',
              description:
                'iOS device type (e.g., "iPhone 16 Pro"). Defaults to "iPhone 16 Pro"',
            },
          },
          required: ['worktreePath'],
        },
      },
      {
        name: 'session_end',
        description:
          'End a session, stop any running flutter processes, shutdown and delete the simulator.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID to end',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'session_list',
        description: 'List all active sessions with their details.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'simulator_list',
        description: 'List available iOS device types for simulator creation.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'flutter_run',
        description:
          'Start Flutter app on the simulator. Streams logs in real-time. Returns immediately with process info.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            target: {
              type: 'string',
              description: 'Target file (e.g., lib/main.dart)',
            },
            flavor: {
              type: 'string',
              description: 'Build flavor',
            },
            additionalArgs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Additional Flutter arguments',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_stop',
        description: 'Stop the running Flutter app gracefully (sends \'q\' command).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_hot_reload',
        description: 'Trigger hot reload for the running Flutter app (sends \'r\' command).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_hot_restart',
        description: 'Trigger hot restart for the running Flutter app (sends \'R\' command).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_logs',
        description:
          'Get buffered Flutter logs with pagination. Use fromIndex to poll for new logs.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            fromIndex: {
              type: 'number',
              description: 'Start index for log retrieval',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of lines to return (default: 100)',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'ui_tap',
        description: 'Tap at coordinates on the simulator screen.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            x: {
              type: 'number',
              description: 'X coordinate',
            },
            y: {
              type: 'number',
              description: 'Y coordinate',
            },
            duration: {
              type: 'number',
              description: 'Duration in seconds for long press',
            },
          },
          required: ['sessionId', 'x', 'y'],
        },
      },
      {
        name: 'ui_type',
        description: 'Input text into the focused field on the simulator.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            text: {
              type: 'string',
              description: 'Text to type',
            },
          },
          required: ['sessionId', 'text'],
        },
      },
      {
        name: 'ui_swipe',
        description: 'Swipe from one point to another on the simulator screen.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            x_start: {
              type: 'number',
              description: 'Start X coordinate',
            },
            y_start: {
              type: 'number',
              description: 'Start Y coordinate',
            },
            x_end: {
              type: 'number',
              description: 'End X coordinate',
            },
            y_end: {
              type: 'number',
              description: 'End Y coordinate',
            },
            duration: {
              type: 'number',
              description: 'Swipe duration in seconds',
            },
          },
          required: ['sessionId', 'x_start', 'y_start', 'x_end', 'y_end'],
        },
      },
      {
        name: 'ui_describe_all',
        description: 'Get accessibility tree for the entire screen.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'ui_describe_point',
        description: 'Get accessibility information at a specific point on the screen.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            x: {
              type: 'number',
              description: 'X coordinate',
            },
            y: {
              type: 'number',
              description: 'Y coordinate',
            },
          },
          required: ['sessionId', 'x', 'y'],
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the simulator. Returns base64-encoded PNG image data in the response for use from Docker containers. Optional outputPath for local file save.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID',
            },
            outputPath: {
              type: 'string',
              description: 'Optional path where screenshot should be saved on host filesystem',
            },
          },
          required: ['sessionId'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('Tool called', { name, args });

    try {
      switch (name) {
        case 'session_start': {
          const parsed = sessionStartSchema.parse(args);
          const result = await handleSessionStart(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'session_end': {
          const parsed = sessionEndSchema.parse(args);
          const result = await handleSessionEnd(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'session_list': {
          const result = handleSessionList();
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'simulator_list': {
          const result = await handleSimulatorList();
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_run': {
          const parsed = flutterRunSchema.parse(args);
          const result = await handleFlutterRun(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_stop': {
          const parsed = flutterCommandSchema.parse(args);
          const result = handleFlutterStop(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_hot_reload': {
          const parsed = flutterCommandSchema.parse(args);
          const result = handleFlutterHotReload(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_hot_restart': {
          const parsed = flutterCommandSchema.parse(args);
          const result = handleFlutterHotRestart(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_logs': {
          const parsed = flutterLogsSchema.parse(args);
          const result = handleFlutterLogs(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'ui_tap': {
          const parsed = uiTapSchema.parse(args);
          const result = await handleUiTap(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'ui_type': {
          const parsed = uiTypeSchema.parse(args);
          const result = await handleUiType(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'ui_swipe': {
          const parsed = uiSwipeSchema.parse(args);
          const result = await handleUiSwipe(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'ui_describe_all': {
          const parsed = uiDescribeAllSchema.parse(args);
          const result = await handleUiDescribeAll(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'ui_describe_point': {
          const parsed = uiDescribePointSchema.parse(args);
          const result = await handleUiDescribePoint(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'screenshot': {
          const parsed = screenshotSchema.parse(args);
          const result = await handleScreenshot(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Tool error', { name, error: errorMessage });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  logger.info('Tools registered');
}
