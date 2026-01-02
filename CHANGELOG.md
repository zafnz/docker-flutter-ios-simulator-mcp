# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-02

### Added
- Initial release of flutter-ios-mcp
- MCP server with HTTP transport for Flutter iOS development
- Session-based isolation with dedicated simulators per session
- Flutter development tools:
  - `flutter_run` - Build and run Flutter apps
  - `flutter_build` - Build iOS apps without running
  - `flutter_test` - Run Flutter tests
  - `flutter_clean` - Clean build cache and artifacts
  - `flutter_hot_reload` - Hot reload support
  - `flutter_hot_restart` - Hot restart support
  - `flutter_stop` - Stop running apps
  - `flutter_logs` - Poll Flutter logs with cursor-based pagination
- UI automation tools via Facebook IDB:
  - `ui_tap` - Tap at coordinates
  - `ui_swipe` - Swipe gestures
  - `ui_type` - Type text
  - `ui_describe_all` - Get accessibility tree
  - `ui_describe_point` - Inspect elements
  - `screenshot` - Capture simulator screen
- Session management tools:
  - `session_start` - Create new development session
  - `session_end` - Clean up and delete simulator
  - `session_list` - List active sessions
  - `simulator_list` - List available device types
- CLI options:
  - `--port` - Configure server port
  - `--host` - Configure bind address
  - `--allow-only` - Restrict allowed project paths
  - `--max-sessions` - Limit concurrent sessions
  - `--pre-build-script` - Run commands before builds
  - `--post-build-script` - Run commands after builds
- Security features:
  - Path validation to prevent access to system directories
  - Flutter project validation (requires pubspec.yaml)
  - Input validation for all parameters
  - Command injection prevention
- Comprehensive test suite (83 tests)
- Complete documentation (README, CLAUDE.md, PROJECT.md)


[Unreleased]: https://github.com/zafnz/flutter-ios-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zafnz/flutter-ios-mcp/releases/tag/v0.1.0
