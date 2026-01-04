# CLAUDE.md

Information and instructions to AI agents using this MCP

## Purpose

This MCP provides access to and control of building flutter apps, launching the iOS simulator, and interacting with it, including taking screenshots and getting accessibility info.

### 3. Use the Tools

The MCP server provides these tools to AI agents:

**Session Management:**
- `session_start` - Create a new development session with a simulator
- `session_end` - Clean up and delete the simulator
- `session_list` - View active sessions

**Flutter Development:**
- `flutter_run` - Build and launch your app
- `flutter_build` - Build iOS app without running (for CI/deployment)
- `flutter_test` - Run Flutter tests and return results
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
// Returns: { sessionId: "abc-123", simulatorUdid: "..." }

// 2. Run the Flutter app
flutter_run({ sessionId: "abc-123" })

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

