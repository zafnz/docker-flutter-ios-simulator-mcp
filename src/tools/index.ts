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
          'Start a new Flutter development session. Creates and boots an iOS simulator, associates it with your Flutter project directory. This is always the first step - you must create a session before running Flutter or interacting with the simulator. Returns session ID (use this for all subsequent operations) and simulator UDID.',
        inputSchema: {
          type: 'object',
          properties: {
            worktreePath: {
              type: 'string',
              description: 'Absolute path to your Flutter project directory (the folder containing pubspec.yaml)',
            },
            deviceType: {
              type: 'string',
              description:
                'iOS device type to simulate (e.g., "iPhone 16 Pro", "iPhone 15", "iPad Pro"). Defaults to "iPhone 16 Pro". Use simulator_list to see available types.',
            },
          },
          required: ['worktreePath'],
        },
      },
      {
        name: 'session_end',
        description:
          'Clean up and end a Flutter development session. Gracefully stops the Flutter app, shuts down the simulator, and deletes it. Always call this when done to avoid leaving orphaned simulators running. Required before starting a new session for the same project.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'session_list',
        description: 'List all currently active Flutter development sessions. Shows session IDs, project paths, simulator UDIDs, and device types. Useful for checking what sessions are running or finding a session ID you forgot.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'simulator_list',
        description: 'List all available iOS device types that can be used for simulator creation. Use this to see valid options for the deviceType parameter in session_start (e.g., "iPhone 16 Pro", "iPhone 15", "iPad Pro 12.9-inch").',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'flutter_run',
        description:
          'Build and launch the Flutter app on the simulator. This starts the Flutter development server and runs your app. Returns immediately with process info - the app builds in the background. Use flutter_logs to monitor build progress and see any errors. First build may take 1-2 minutes.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            target: {
              type: 'string',
              description: 'Target entry point file (e.g., "lib/main.dart"). Defaults to lib/main.dart if not specified.',
            },
            flavor: {
              type: 'string',
              description: 'Build flavor for multi-flavor apps (e.g., "dev", "prod")',
            },
            additionalArgs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Additional Flutter CLI arguments',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_stop',
        description: 'Stop the running Flutter app gracefully. Use this before ending the session or when you need to restart the app completely.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_hot_reload',
        description: 'Perform a hot reload - quickly inject updated code into the running app while preserving state. Use this after making code changes to see them instantly without restarting. Faster than hot restart but cannot handle certain changes (new dependencies, native code, etc).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_hot_restart',
        description: 'Perform a hot restart - restart the app from scratch while keeping the same build. Slower than hot reload but handles more types of changes. Use when hot reload fails or when you need to reset app state.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_logs',
        description:
          'Retrieve Flutter build output and app logs. Logs are buffered in memory - use fromIndex to poll for new logs since your last check. Essential for monitoring build progress, debugging errors, and seeing app output (print statements, exceptions, etc).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            fromIndex: {
              type: 'number',
              description: 'Start reading from this log line index. Use the nextIndex from previous response to get only new logs. Omit to get all logs from the beginning.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of log lines to return (default: 100). Use smaller values for frequent polling.',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'ui_tap',
        description: 'Simulate a tap/touch on the simulator screen at specific coordinates. Use to interact with buttons, text fields, or any tappable UI element. Take a screenshot first to identify coordinates. Add duration for long press gestures.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            x: {
              type: 'number',
              description: 'X coordinate in points (horizontal position, 0=left edge)',
            },
            y: {
              type: 'number',
              description: 'Y coordinate in points (vertical position, 0=top edge)',
            },
            duration: {
              type: 'number',
              description: 'Hold duration in seconds for long press. Omit for regular tap.',
            },
          },
          required: ['sessionId', 'x', 'y'],
        },
      },
      {
        name: 'ui_type',
        description: 'Type text into the currently focused text field on the simulator. Tap on a text field first to focus it, then use this to enter text. Works for text fields, text areas, search boxes, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            text: {
              type: 'string',
              description: 'Text to type into the focused field',
            },
          },
          required: ['sessionId', 'text'],
        },
      },
      {
        name: 'ui_swipe',
        description: 'Simulate a swipe gesture on the simulator screen. Use for scrolling, swiping between pages, pull-to-refresh, dismissing items, etc. Specify start and end coordinates to control direction and distance.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            x_start: {
              type: 'number',
              description: 'Starting X coordinate in points',
            },
            y_start: {
              type: 'number',
              description: 'Starting Y coordinate in points',
            },
            x_end: {
              type: 'number',
              description: 'Ending X coordinate in points',
            },
            y_end: {
              type: 'number',
              description: 'Ending Y coordinate in points',
            },
            duration: {
              type: 'number',
              description: 'Swipe duration in seconds. Slower swipes feel more natural.',
            },
          },
          required: ['sessionId', 'x_start', 'y_start', 'x_end', 'y_end'],
        },
      },
      {
        name: 'ui_describe_all',
        description: 'Get the complete accessibility tree for everything currently visible on screen. Returns detailed information about all UI elements including labels, roles, positions, and hierarchy. Use this to understand the screen structure and find elements to interact with.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'ui_describe_point',
        description: 'Get accessibility information for the specific UI element at given coordinates. Returns details about what element is at that position - useful for identifying buttons, labels, or interactive elements before tapping.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            x: {
              type: 'number',
              description: 'X coordinate in points to inspect',
            },
            y: {
              type: 'number',
              description: 'Y coordinate in points to inspect',
            },
          },
          required: ['sessionId', 'x', 'y'],
        },
      },
      {
        name: 'screenshot',
        description: 'Capture a screenshot of the current simulator screen. Returns the image directly in the response as PNG data - you will see the image automatically (no need to save to file). Essential for understanding what is currently displayed and identifying UI elements for interaction. Works seamlessly from Docker containers.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
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
            content: [
              {
                type: 'image',
                data: result.imageData,
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: `Screenshot captured: ${result.path}\nSize: ${String(result.imageData.length)} bytes (base64)`,
              },
            ],
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
