# flutter-ios-mcp

A Model Context Protocol (MCP) server that provides Flutter iOS development tooling for AI agents. Enables containerized Claude instances to build, run, and interact with Flutter iOS applications on a macOS host via Streamable HTTP transport.

## Project Overview

This MCP server bridges Docker-containerized AI agents with the Flutter/iOS toolchain running on macOS. It provides session-based isolation so multiple agents can work concurrently on different Flutter projects, each with their own iOS Simulator instance.

### Key Features

- **Session-based isolation**: Each agent gets its own simulator and flutter process
- **Concurrent sessions**: Multiple agents can work on different Flutter projects simultaneously
- **Log buffering & polling**: Flutter logs buffered in memory, retrieved via cursor-based pagination
- **Hot reload/restart**: Interactive development workflow support
- **Simulator UI control**: Tap, swipe, type, screenshot via Facebook IDB
- **Remote access**: Streamable HTTP transport (no mcp-proxy needed)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     macOS Host                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │     flutter-ios-mcp (Streamable HTTP)               │    │
│  │          http://localhost:3000/mcp                  │    │
│  │                                                     │    │
│  │  Sessions:                                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │    │
│  │  │ agent-1  │ │ agent-2  │ │ agent-N  │             │    │
│  │  │ project  │ │ project  │ │ project  │             │    │
│  │  │ sim UDID │ │ sim UDID │ │ sim UDID │             │    │
│  │  │ flutter  │ │ flutter  │ │ flutter  │             │    │
│  │  │ process  │ │ process  │ │ process  │             │    │
│  │  └──────────┘ └──────────┘ └──────────┘             │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                  │
│         ┌────────────────┼────────────────┐                 │
│         ▼                ▼                ▼                 │
│    Simulator 1     Simulator 2      Simulator N             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │    /path/to/project-1  (Flutter project)            │    │
│  │    /path/to/project-2  (Flutter project)            │    │
│  │    /path/to/project-3  (Flutter project)            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ HTTP (host.docker.internal:3000)
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                    Docker Container(s)                      │
│              Claude agents connect via MCP                  │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (Streamable HTTP transport)
- **HTTP Framework**: Express
- **Schema Validation**: Zod
- **iOS Simulator**: `xcrun simctl` (native macOS)
- **UI Automation**: Facebook IDB (`idb`)
- **Flutter**: System Flutter installation

## Project Structure

```
flutter-ios-mcp/
├── src/
│   ├── index.ts                    # Entry point, Express server setup
│   ├── server.ts                   # MCP server configuration
│   ├── transport.ts                # Streamable HTTP transport setup
│   ├── session/
│   │   ├── manager.ts              # Session lifecycle (create/destroy/list)
│   │   ├── state.ts                # Session state store
│   │   └── types.ts                # Session type definitions
│   ├── flutter/
│   │   ├── process.ts              # Flutter process spawn + log buffering
│   │   ├── commands.ts             # Flutter CLI command builders
│   │   └── types.ts
│   ├── simulator/
│   │   ├── simctl.ts               # xcrun simctl wrapper
│   │   ├── idb.ts                  # Facebook IDB wrapper
│   │   └── types.ts
│   ├── tools/
│   │   ├── index.ts                # Tool registration aggregator
│   │   ├── session.ts              # session_start, session_end, session_list
│   │   ├── simulator.ts            # simulator_list
│   │   ├── flutter-commands.ts     # flutter_run, stop, hot_reload, hot_restart, logs
│   │   ├── flutter-build.ts        # flutter_build, flutter_test (Phase 3)
│   │   └── simulator-ui.ts         # UI interaction tools (Phase 4)
│   └── utils/
│       ├── exec.ts                 # Promisified exec with streaming support
│       └── logger.ts               # Structured logging
├── package.json
├── tsconfig.json
├── CLAUDE.md                       # This file
└── README.md                       # User-facing documentation
```

## MCP Tools

### Session Management

| Tool | Description |
|------|-------------|
| `session_start` | Create session with Flutter project path, boot new simulator. Returns session_id + UDID |
| `session_end` | Stop flutter process, shutdown and delete simulator |
| `session_list` | List all active sessions with state |

### Flutter Development

| Tool | Description |
|------|-------------|
| `flutter_run` | Start `flutter run -d <udid>`, returns immediately with PID |
| `flutter_stop` | Gracefully stop flutter run (sends 'q') |
| `flutter_hot_reload` | Trigger hot reload (sends 'r') |
| `flutter_hot_restart` | Trigger hot restart (sends 'R') |
| `flutter_logs` | Get buffered logs with cursor-based pagination (fromIndex) |
| `flutter_build` | Run `flutter build ios` (Phase 3) |
| `flutter_test` | Run `flutter test` (Phase 3) |
| `flutter_pub_get` | Run `flutter pub get` (Phase 3) |
| `flutter_clean` | Run `flutter clean` (Phase 3) |
| `flutter_analyze` | Run `flutter analyze` (Phase 3) |

### Simulator UI (via IDB)

| Tool | Description |
|------|-------------|
| `ui_describe_all` | Get accessibility tree for entire screen |
| `ui_describe_point` | Get accessibility element at x,y coordinates |
| `ui_tap` | Tap at coordinates (optional duration for long press) |
| `ui_type` | Input text |
| `ui_swipe` | Swipe gesture with start/end coordinates |
| `screenshot` | Take screenshot, returns base64-encoded PNG in response (Docker-compatible) |
| `ui_view` | Get compressed screenshot as base64 (for LLM vision) |
| `install_app` | Install .app bundle on simulator |
| `launch_app` | Launch app by bundle identifier |

### Simulator Management

| Tool | Description |
|------|-------------|
| `simulator_list` | List available device types for simulator creation |

## Implementation Phases

### Phase 1: Foundation
- [x] Project scaffolding (package.json, tsconfig, eslint, jest configs)
- [x] Express server with Streamable HTTP transport
- [x] MCP server initialization and tool registration
- [x] Session manager with in-memory state (SessionManager + sessionState)
- [x] Simulator control: `simctl create`, `boot`, `shutdown`, `delete`
- [x] Tools: `session_start`, `session_end`, `session_list`, `simulator_list`

### Phase 2: Flutter Process Core
- [x] Flutter process spawning with pipes (via spawnStreaming)
- [x] Log buffer with line indexing and timestamps (LogBuffer class)
- [x] Stdin routing for hot reload commands (r/R/q)
- [x] Non-blocking `flutter_run` (returns immediately with PID)
- [x] Tools: `flutter_run`, `flutter_stop`, `flutter_hot_reload`, `flutter_hot_restart`
- [x] Tool: `flutter_logs` (polling with fromIndex cursor)

**Note:** MCP tool responses cannot natively stream. The correct pattern is:
1. `flutter_run` starts process and returns immediately
2. Logs buffer in memory (FlutterProcessManager + LogBuffer)
3. Client polls `flutter_logs` with `fromIndex` for cursor-based pagination

### Phase 3: Flutter Build & Test
- [ ] Non-blocking output for long-running commands (same polling pattern)
- [ ] Tools: `flutter_build`, `flutter_test` (return immediately, poll for logs)
- [ ] Tools: `flutter_pub_get`, `flutter_clean`, `flutter_analyze`

### Phase 4: Simulator UI
- [x] IDB wrapper with proper error handling
- [x] Tools: `ui_describe_all`, `ui_describe_point`
- [x] Tools: `ui_tap`, `ui_type`, `ui_swipe`
- [x] Tools: `screenshot`
- [ ] Tools: `ui_view` (compressed screenshot)
- [ ] Tools: `install_app`, `launch_app`

### Phase 5: Polish & Documentation
- [x] Comprehensive error handling (timeouts, better error messages)
- [x] Graceful shutdown (cleanup all sessions)
- [x] Input validation (project path exists)
- [x] README with setup instructions
- [x] MIT License
- [x] CLI arguments (--port, --host, --help)
- [ ] Docker connectivity testing guide

## Future Enhancements

### Dual Transport Support (Stdio + HTTP)
- [ ] Support both stdio and HTTP transports
- [ ] Add `--stdio` flag for local MCP usage via Claude Code CLI
- [ ] Default to HTTP mode for remote/Docker usage
- [ ] Allow port configuration via `-p` or `--port` flag
- [ ] Example: `claude mcp add flutter-ios-mcp npm start -- --stdio`
- [ ] Example: `npm start -- --port 3000` (HTTP mode)

### Long Polling for Logs
- [ ] Implement `waitForNew` parameter in `flutter_logs` tool
- [ ] Block request until new logs arrive or timeout occurs
- [ ] More efficient than sleep + poll pattern
- [ ] Returns immediately when new data available

## Design Decisions

### Session Lifecycle
- No session pooling or cleanup timers - simple create/destroy model
- Each session creates a fresh simulator via `simctl create`
- Session ID is a UUID, maps to project path + simulator UDID + flutter process

### Log Streaming
- MCP tool responses cannot natively stream (they return complete text content)
- `flutter_run` returns immediately without blocking on process completion
- All logs buffered in memory per session via `LogBuffer` class
- `flutter_logs` provides cursor-based polling with `fromIndex` parameter
- Logs cleared on session end via `FlutterProcessManager.cleanup()`

### Simulator Creation
- Use `xcrun simctl create` with user-specified device type
- Default to latest iPhone Pro model if not specified
- Simulators are deleted on session end (no reuse)

### Error Handling
- Tools return structured errors with actionable messages
- Process failures include last N lines of output
- Session operations are idempotent where possible

### Docker Compatibility
- Screenshot tool returns base64-encoded image data in MCP response
- No filesystem access needed for Docker clients to view screenshots
- outputPath is optional - use for local file saves on host
- All data transported over MCP protocol (HTTP or stdio)

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "express": "^4.x",
    "zod": "^3.x",
    "uuid": "^9.x"
  },
  "devDependencies": {
    "@types/express": "^4.x",
    "@types/node": "^20.x",
    "@types/uuid": "^9.x",
    "typescript": "^5.x"
  }
}
```

## Prerequisites (macOS Host)

- Node.js 18+
- Xcode with iOS Simulators installed
- Flutter SDK in PATH
- Facebook IDB installed (see README for installation instructions)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `HOST` | HTTP server bind address | `0.0.0.0` |
| `FLUTTER_PATH` | Path to flutter binary | `flutter` (from PATH) |
| `IDB_PATH` | Path to idb binary | `idb` (from PATH) |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Usage

### Starting the Server

```bash
npm install
npm run build
npm start
# Server running at http://localhost:3000/mcp
```

### Connecting from Docker

Configure MCP client to connect to `http://host.docker.internal:3000/mcp`

### Example Agent Workflow

```
1. session_start({ worktreePath: "/path/to/my-flutter-app", deviceType: "iPhone 16 Pro" })
   → { sessionId: "abc-123", simulatorUdid: "XXXX-YYYY" }

2. flutter_run({ sessionId: "abc-123" })
   → { success: true, pid: 12345, message: "Flutter process started" }

3. flutter_logs({ sessionId: "abc-123", fromIndex: 0, limit: 100 })
   → { logs: [...], nextIndex: 100, hasMore: true }

4. [Agent edits code in project]

5. flutter_hot_reload({ sessionId: "abc-123" })
   → { success: true, message: "Hot reload complete" }

6. screenshot({ sessionId: "abc-123" })
   → Returns PNG image directly in MCP response

7. ui_tap({ sessionId: "abc-123", x: 195, y: 400 })
   → { success: true }

8. flutter_stop({ sessionId: "abc-123" })
   → { success: true }

9. session_end({ sessionId: "abc-123" })
   → { success: true, message: "Session abc-123 ended successfully" }
```

## References

- [MCP Streamable HTTP Spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [ios-simulator-mcp](https://github.com/joshuayoes/ios-simulator-mcp) - Reference for simulator tools
- [Facebook IDB](https://fbidb.io/) - iOS automation
- [xcrun simctl](https://developer.apple.com/documentation/xcode/simulating-your-app-in-the-simulator) - Simulator CLI