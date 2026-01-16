# docker-flutter-ios-simulator-mcp

**Model Context Protocol server for Flutter iOS development with AI agents**

Enables AI agents (like Claude) inside a Docker container to build, run, and interact with Flutter iOS applications through an iOS Simulator running on the host. Perfect for running claude inside a secure container while allowing it to build and test iOS and macOS apps

## Features

- 🎯 **Session-based Development** - Isolated simulator and Flutter process per session
- 🔥 **Hot Reload & Restart** - Instant code updates without full rebuilds
- 📱 **UI Automation** - Tap, swipe, type, and interact with the simulator
- 📸 **Visual Feedback** - Screenshots returned as images + HTTP URLs (accessible from anywhere)
- 🔍 **Accessibility Tree** - Inspect UI elements and hierarchy
- 📊 **Live Logs** - Real-time Flutter build output and app logs
- 🌐 **HTTP Transport** - Works from Docker containers (no filesystem access needed)

## Architecture

Enables AI agents running in Docker containers to control iOS Simulators on the macOS host:

```
┌─────────────────────────────────────────────────────────────────┐
│                         macOS Host                              │
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────────────────┐   │
│  │ iOS Simulators   │         │ docker-flutter-ios-         │   │
│  │ ┌─ Sim 1 ──────┐ │◄────────┤ simulator-mcp               │   │
│  │ ┌─ Sim 2 ──────┐ │         │                             │   │
│  │ │ Flutter App  │ │         │ • Session Management        │   │
│  │ │              │ │         │ • Flutter Build/Run/Test    │   │
│  │ └──────────────┘ │         │ • Hot Reload/Restart        │   │
│  │                  │         │ • Screenshots (via IDB)     │   │
│  │  Status: Booted  │         │ • UI Automation             │   │
│  └──────────────────┘         │ • Log Streaming             │   │
│                               └─────────────────────────────┘   │
│                                         ▲                       │
│                                         │ HTTP/MCP              │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    │                                            │
          ┌─────────┴──────────┐              ┌──────────────────┴┐
          │  Docker Container  │              │ Docker Container  │
          │                    │              │                   │
          │  ┌──────────────┐  │              │ ┌───────────────┐ │
          │  │ AI Agent     │  │              │ │ AI Agent      │ │
          │  │ (Claude)     │──┼──────────────┼─│ (Claude)      │ │
          │  │              │  │              │ │               │ │
          │  │ Builds &     │  │              │ │ Tests &       │ │
          │  │ Develops     │  │              │ │ Debugs        │ │
          │  └──────────────┘  │              │ └───────────────┘ │
          │                    │              │                   │
          └────────────────────┘              └───────────────────┘
```

**Flow:**
1. AI agents in containers connect to MCP server via HTTP
2. MCP server manages iOS Simulator instances and Flutter processes
3. Agents can build, run, test, and interact with Flutter apps
4. Screenshots and logs flow back to agents in real-time

## Prerequisites

**macOS only** - Requires Xcode and iOS Simulator

1. **Xcode** - Install from Mac App Store, then run:
   ```bash
   sudo xcode-select --switch /Applications/Xcode.app
   xcodebuild -runFirstLaunch
   ```

2. **Flutter SDK** - [Install Flutter](https://docs.flutter.dev/get-started/install/macos) and ensure it's in your PATH:
   ```bash
   flutter --version
   ```

3. **Node.js 18+** - [Install Node.js](https://nodejs.org/)

4. **Facebook IDB** - iOS automation tool:
   MacOS's Python environment is pretty borked at the moment, it's best to use brew and pipx to manage the installation:

   ```bash
   # First, ensure you have a modern python installed via homebrew (if not already done)
   brew install python@3.12

   # Then, install pipx using that specific python's pip
   python3.12 -m pip install pipx

   # Ensure pipx is added to your PATH
   pipx ensurepath

   # Install IDB
   pipx install fb-idb

   # Verify installation
   idb --help

   # Then install idb-companion 
   brew tap facebook/fb
   brew install idb-companion

   # Verify it works
   idb list-targets
   ```

## Installation

### Option 1: NPX (Recommended for Users)

No installation needed! Run directly with npx:

```bash
npx docker-flutter-ios-simulator-mcp
# Server starts at http://localhost:3000/mcp
```

### Option 2: Local Development

Clone and run from source:

```bash
# Clone the repository
git clone https://github.com/zafnz/docker-flutter-ios-simulator-mcp.git
cd docker-flutter-ios-simulator-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the server
npm start
# Server starts at http://localhost:3000/mcp
```

## Quick Start

### 1. Start the MCP Server

```bash
npx docker-flutter-ios-simulator-mcp
```

The server will start on port 3000 by default.

### 2. Configure Your MCP Client

For **Claude Desktop** or **Docker Host**, connect to:
```
http://localhost:3000/mcp
```
```bash
claude mcp add docker-flutter-ios-simulator-mcp http://localhost:3000/mcp
```

From **Inside Docker**, use:
```
http://host.docker.internal:3000/mcp
```
```bash
claude mcp add docker-flutter-ios-simulator-mcp http://host.docker.internal:3000/mcp
```

### 3. Use the Tools

The MCP server provides these tools to AI agents:

**Session Management:**
- `session_start` - Create a new development session (simulator starts on first flutter_run or explicit start_simulator)
- `start_simulator` - Explicitly start an iOS simulator for a session
- `session_end` - Clean up and delete the simulator
- `session_list` - View active sessions

**Flutter Development:**
- `flutter_run` - Build and launch your app
- `flutter_build` - Build iOS app without running (for CI/deployment)
- `flutter_test` - Run Flutter tests (supports filtering by file/directory, test name, and tags)
- `flutter_clean` - Clean build cache and artifacts
- `flutter_logs` - Monitor build progress and app output
- `flutter_hot_reload` - Apply code changes instantly
- `flutter_hot_restart` - Restart the app
- `flutter_stop` - Stop the running app

**UI Interaction:**
- `screenshot` - Capture and view the simulator screen (returns image + HTTP URL)
- `ui_tap` - Tap at coordinates
- `ui_swipe` - Swipe gestures (scrolling, swiping)
- `ui_type` - Enter text into fields
- `ui_describe_all` - Get accessibility tree
- `ui_describe_point` - Inspect element at coordinates

**Device Management:**
- `simulator_list` - See available iOS device types

## Example Workflow

Here's a typical AI agent workflow:

```javascript
// 1. Start a session with your Flutter project
session_start({
  worktreePath: "/path/to/your/flutter/project",
  deviceType: "iPhone 16 Pro"
})
// Returns: { sessionId: "abc-123", deviceType: "iPhone 16 Pro", worktreePath: "..." }
// Note: Simulator is NOT started yet - starts automatically when you call flutter_run

// 2. Run the Flutter app (automatically starts simulator if not already started)
flutter_run({ sessionId: "abc-123" })
// Simulator boots automatically on first flutter_run

// Alternative: Explicitly start simulator before running Flutter
// start_simulator({ sessionId: "abc-123" })
// Returns: { simulatorUdid: "...", deviceType: "iPhone 16 Pro", message: "..." }

// 3. Monitor build progress (poll every few seconds)
flutter_logs({
  sessionId: "abc-123",
  fromIndex: 0,  // Start from beginning
  limit: 100     // Get 100 lines
})

// 4. Take a screenshot to see the app
screenshot({ sessionId: "abc-123" })
// Returns image directly in response + HTTP URL!
// Example URL: http://localhost:3000/screenshot/abc-123-1234567890.png

// 5. Interact with the UI
ui_tap({ sessionId: "abc-123", x: 200, y: 400 })

// 6. Make code changes, then hot reload
flutter_hot_reload({ sessionId: "abc-123" })

// 7. Run tests (all tests, or filter by file/directory)
flutter_test({ sessionId: "abc-123" })
// Or run specific tests:
flutter_test({
  sessionId: "abc-123",
  testTarget: "test/unit/",  // Run only tests in this directory
  testNameMatch: "login.*"   // Further filter by test name
})
// Returns: { reference: 1 }

// 8. Check test progress
flutter_test_results({ reference: 1 })
// Returns: { tests_complete: 10, tests_total: 20, passes: 8, fails: 2, complete: false }

// 9. Clean up when done
session_end({ sessionId: "abc-123" })
```

## Configuration

### Command-Line Options

```bash
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
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `HOST` | Server bind address (use `0.0.0.0` for Docker) | `127.0.0.1` |
| `ALLOW_ONLY` | Path prefix for allowed Flutter projects | `/Users/` |
| `BASE_PATH` | Base path for resolving relative worktree paths | (none) |
| `MAX_SESSIONS` | Maximum number of concurrent sessions | `10` |
| `SESSION_TIMEOUT` | Terminate inactive sessions after N minutes | (none) |
| `PRE_BUILD_SCRIPT` | Command to run before flutter build/run | (none) |
| `POST_BUILD_SCRIPT` | Command to run after flutter build/run | (none) |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |

### Examples

```bash
# Default (localhost only, /Users/ projects)
npx docker-flutter-ios-simulator-mcp

# Custom port
npx docker-flutter-ios-simulator-mcp --port 8080

# Docker (bind to all interfaces)
npx docker-flutter-ios-simulator-mcp --host 0.0.0.0

# Restrict to specific directory
npx docker-flutter-ios-simulator-mcp --allow-only /Users/alice/flutter-projects

# Use base path for relative worktree paths
npx docker-flutter-ios-simulator-mcp --base-path /Users/alice/flutter-projects

# Auto-cleanup inactive sessions after 30 minutes
npx docker-flutter-ios-simulator-mcp --session-timeout 30

# Allow more concurrent sessions
npx docker-flutter-ios-simulator-mcp --max-sessions 20

# Run git pull before each build
npx docker-flutter-ios-simulator-mcp --pre-build-script "git pull"

# Run commands before and after builds
npx docker-flutter-ios-simulator-mcp --pre-build-script "git pull" --post-build-script "echo Build complete"

# Multiple options
npx docker-flutter-ios-simulator-mcp --port 8080 --host 0.0.0.0 --base-path /Users/alice/projects --session-timeout 60 --max-sessions 15
```

### Security

By default, the server:
- Binds to `127.0.0.1` (localhost only) for security
- Only allows Flutter projects under `/Users/` to prevent access to system directories
- Validates all project paths have a `pubspec.yaml` file
- Limits concurrent sessions to 10 to prevent resource exhaustion

## Troubleshooting

### "Session not found" errors
- Sessions are in-memory and lost if the MCP server restarts
- Create a new session after restarting the server

### "Simulator failed to boot"
- Check Xcode is installed: `xcode-select -p`
- Verify simulators are available: `xcrun simctl list devices`
- Try rebooting: `sudo killall -9 com.apple.CoreSimulator.CoreSimulatorService`

### "Flutter not found"
- Ensure Flutter is in your PATH: `which flutter`
- Add to PATH in `~/.zshrc` or `~/.bash_profile`

### "IDB command failed"
- Verify IDB is installed: `which idb`
- Check IDB version: `idb --version`
- Reinstall if needed: `pipx install --force fb-idb`

### Screenshots not appearing
- Screenshots are returned as images in the MCP response
- An HTTP URL is also provided to fetch the screenshot (e.g., http://localhost:3000/screenshot/session-123-1234567890.png)
- The URL works from anywhere - browsers, Docker containers, or HTTP clients
- Screenshots are saved to /tmp/mcp-screenshots/ on the server

### First Flutter build is slow
- First build can take 1-2 minutes (normal)
- Use `flutter_logs` to monitor progress
- Subsequent builds are much faster with hot reload

## Development

### Run in Development Mode

```bash
npm run dev          # Watch mode with auto-restart
npm run build        # Build TypeScript
npm test             # Run tests
npm run test:watch   # Tests in watch mode
npm run lint         # Check code style
npm run typecheck    # Type checking
```

### Project Structure

```
src/
├── index.ts           # Entry point & Express server
├── server.ts          # MCP server setup
├── session/           # Session management
├── flutter/           # Flutter process control
├── simulator/         # iOS Simulator & IDB wrappers
├── tools/             # MCP tool definitions
└── utils/             # Helpers & utilities
```

## How It Works

1. **Session-based Isolation**: Each session creates a dedicated iOS Simulator and Flutter process
2. **HTTP Transport**: MCP protocol over HTTP (works from Docker containers)
3. **Log Buffering**: Flutter output is buffered in memory, retrieved via polling
4. **Screenshot Delivery**: Screenshots returned as base64 PNG in MCP responses AND saved to disk with HTTP URL for easy access
5. **UI Automation**: Uses Facebook IDB for simulator interaction

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## License

MIT

## Links

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Flutter Documentation](https://docs.flutter.dev/)
- [Facebook IDB](https://fbidb.io/)
- [Xcode](https://developer.apple.com/xcode/)
