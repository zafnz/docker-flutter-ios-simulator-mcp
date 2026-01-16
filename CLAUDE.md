# CLAUDE.md

Information and instructions to AI agents using this MCP

## Purpose

This MCP provides access to and control of building flutter apps, launching the iOS simulator, and interacting with it, including taking screenshots and getting accessibility info.

### 3. Use the Tools

The MCP server provides these tools to AI agents:

**Session Management:**
- `session_start` - Create a new development session (simulator starts lazily on first flutter_run or explicit start_simulator)
- `start_simulator` - Explicitly start an iOS simulator for a session (optional - flutter_run auto-starts)
- `session_end` - Clean up and delete the simulator
- `session_list` - View active sessions

**Flutter Development:**
- `flutter_run` - Build and launch your app
- `flutter_build` - Build iOS app without running (for CI/deployment)
- `flutter_test` - Run Flutter tests (supports `testTarget` for specific file/directory, `testNameMatch` for regex filtering, `tags` for tag filtering)
- `flutter_test_results` - Get test progress and results
- `flutter_test_logs` - Get detailed test output (failures by default)
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
// NOTE: Simulator is NOT created yet - it starts automatically when you call flutter_run

// 2. Run the Flutter app (auto-starts simulator)
flutter_run({ sessionId: "abc-123" })
// The simulator boots automatically on first flutter_run

// Optional: If you need to start the simulator before running Flutter, use:
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
// Returns image directly in response!

// 5. Interact with the UI
ui_tap({ sessionId: "abc-123", x: 200, y: 400 })

// 6. Make code changes, then hot reload
flutter_hot_reload({ sessionId: "abc-123" })

// 7. Clean up when done
session_end({ sessionId: "abc-123" })
```

