import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getServerBaseUrl } from '../config.js';
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
  flutterBuildSchema,
  flutterCleanSchema,
  handleFlutterRun,
  handleFlutterStop,
  handleFlutterHotReload,
  handleFlutterHotRestart,
  handleFlutterLogs,
  handleFlutterBuild,
  handleFlutterClean,
} from './flutter-commands.js';
import {
  flutterTestSchema,
  flutterTestResultsSchema,
  flutterTestLogsSchema,
  handleFlutterTest,
  handleFlutterTestResults,
  handleFlutterTestLogs,
} from './flutter-test.js';
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
        name: 'flutter_build',
        description:
          'Build the Flutter app for iOS without running it. This is a one-shot command that compiles the app and returns the full build output. Useful for verifying builds succeed before deployment or testing. Unlike flutter_run, this does not start an ongoing process.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            flavor: {
              type: 'string',
              description: 'Build flavor (e.g., "dev", "prod")',
            },
            additionalArgs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Additional Flutter build arguments (e.g., ["--release", "--no-tree-shake-icons"])',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_test',
        description:
          'Begin a Flutter test run. Returns a reference number that can be used with flutter_test_results and flutter_test_logs to monitor progress and retrieve results. Tests run asynchronously in the background - use flutter_test_results to check progress and flutter_test_logs to see detailed output. Supports filtering by test name pattern and tags.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from session_start',
            },
            testNameMatch: {
              type: 'string',
              description: 'Optional regular expression to match test names (e.g., "test_login*" or "widget.*"). Only matching tests will run.',
            },
            timeout: {
              type: 'number',
              description: 'Optional timeout in minutes (default: 10). Tests will be terminated if they exceed this duration.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of tags. Only tests with ALL specified tags will run (e.g., ["unit", "database"])',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'flutter_test_results',
        description:
          'Get the current progress and results of a test run started with flutter_test. Returns number of tests completed, passed, failed, and whether the run is complete. Use showAllTestNames=true to get arrays of all passing and failing test names. Poll this endpoint to monitor long-running test suites.',
        inputSchema: {
          type: 'object',
          properties: {
            reference: {
              type: 'number',
              description: 'Test run reference number from flutter_test',
            },
            showAllTestNames: {
              type: 'boolean',
              description: 'If true, include arrays of all passing and failing test names in the response (default: false)',
            },
          },
          required: ['reference'],
        },
      },
      {
        name: 'flutter_test_logs',
        description:
          'Retrieve detailed logs from a test run. By default returns only failing test logs (failures and errors). Set showAll=true to get logs for all tests including passes. Each log entry contains the test name and its complete output (error messages, stack traces, print statements).',
        inputSchema: {
          type: 'object',
          properties: {
            reference: {
              type: 'number',
              description: 'Test run reference number from flutter_test',
            },
            showAll: {
              type: 'boolean',
              description: 'If true, show logs for all tests. If false (default), show only failing test logs.',
            },
          },
          required: ['reference'],
        },
      },
      {
        name: 'flutter_clean',
        description:
          'Clean the Flutter project build cache and remove build artifacts. This removes the build/ directory and other cached files. Useful when builds fail or when switching between branches with different dependencies. Returns the output of the clean operation.',
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
        description: 'Capture a screenshot of the current simulator screen. Returns the image directly in the response as PNG data AND provides an HTTP URL to fetch the screenshot. You will see the image automatically, and can also access it via the provided URL (e.g., http://localhost:3000/screenshot/session-123-1234567890.png). The URL works from anywhere - browsers, Docker containers, or HTTP clients. Essential for understanding what is currently displayed and identifying UI elements for interaction.',
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

        case 'flutter_build': {
          const parsed = flutterBuildSchema.parse(args);
          const result = await handleFlutterBuild(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_test': {
          const parsed = flutterTestSchema.parse(args);
          const result = handleFlutterTest(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_test_results': {
          const parsed = flutterTestResultsSchema.parse(args);
          const result = handleFlutterTestResults(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_test_logs': {
          const parsed = flutterTestLogsSchema.parse(args);
          const result = handleFlutterTestLogs(parsed);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'flutter_clean': {
          const parsed = flutterCleanSchema.parse(args);
          const result = await handleFlutterClean(parsed);
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
          const baseUrl = getServerBaseUrl();
          const screenshotUrl = `${baseUrl}/screenshot/${result.filename}`;
          return {
            content: [
              {
                type: 'image',
                data: result.imageData,
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: `Screenshot captured\nSize: ${String(result.imageData.length)} bytes (base64)\nURL: ${screenshotUrl}`,
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
