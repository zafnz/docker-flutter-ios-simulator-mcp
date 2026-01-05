import { v4 as uuidv4 } from 'uuid';
import { existsSync, statSync } from 'fs';
import { resolve, join, normalize, relative } from 'path';
import { sessionState } from './state.js';
import { CreateSessionParams, Session, SessionInfo } from './types.js';
import { logger } from '../utils/logger.js';
import { createSimulator, bootSimulator, shutdownSimulator, deleteSimulator } from '../simulator/simctl.js';

export class SessionManager {
  private allowedPathPrefix: string;
  private basePath?: string;
  private maxSessions: number;
  private sessionTimeoutMinutes?: number;
  private timeoutCheckIntervalId?: NodeJS.Timeout;
  private preBuildScript?: string;
  private postBuildScript?: string;

  constructor(allowedPathPrefix = '/Users/', maxSessions = 10) {
    this.allowedPathPrefix = allowedPathPrefix;
    this.maxSessions = maxSessions;
  }

  /**
   * Configure the session manager with security settings.
   *
   * @param allowedPathPrefix - Absolute path prefix for allowed Flutter projects (e.g., "/Users/")
   * @param maxSessions - Optional maximum number of concurrent sessions
   * @param preBuildScript - Optional command to run before flutter build/run
   * @param postBuildScript - Optional command to run after flutter build/run
   * @param basePath - Optional base path for resolving relative worktree paths
   * @param sessionTimeoutMinutes - Optional timeout in minutes for inactive sessions
   *
   * @example
   * sessionManager.configure('/Users/alice/projects', 20, 'git pull', 'echo Done', '/Users/alice/projects', 30);
   */
  configure(
    allowedPathPrefix: string,
    maxSessions?: number,
    preBuildScript?: string,
    postBuildScript?: string,
    basePath?: string,
    sessionTimeoutMinutes?: number
  ): void {
    this.allowedPathPrefix = allowedPathPrefix;
    if (maxSessions !== undefined) {
      this.maxSessions = maxSessions;
    }
    this.preBuildScript = preBuildScript;
    this.postBuildScript = postBuildScript;
    if (basePath !== undefined) {
      this.basePath = resolve(basePath);
    }
    if (sessionTimeoutMinutes !== undefined) {
      this.sessionTimeoutMinutes = sessionTimeoutMinutes;
      this.startTimeoutMonitoring();
    }
    logger.info('SessionManager configured', {
      allowedPathPrefix,
      basePath: basePath || 'none',
      maxSessions: this.maxSessions,
      sessionTimeout: sessionTimeoutMinutes ? `${String(sessionTimeoutMinutes)} minutes` : 'none',
      preBuildScript: preBuildScript || 'none',
      postBuildScript: postBuildScript || 'none',
    });
  }

  /**
   * Resolves a worktree path to an absolute path, applying basePath if configured.
   * Protects against path traversal attacks.
   *
   * @param worktreePath - Path provided by the user (relative or absolute)
   * @returns Fully resolved absolute path
   * @throws {Error} If path traversal is detected
   */
  private resolveWorktreePath(worktreePath: string): string {
    let resolvedPath: string;

    if (this.basePath) {
      // When basePath is set, treat worktreePath as relative to basePath
      // First normalize the worktreePath to handle . and ..
      const normalizedWorktree = normalize(worktreePath);

      // Join basePath with the worktreePath
      const joinedPath = join(this.basePath, normalizedWorktree);

      // Resolve to get the absolute path
      resolvedPath = resolve(joinedPath);

      // Security: Protect against path traversal
      // Ensure the resolved path is still within basePath
      const relPath = relative(this.basePath, resolvedPath);
      if (relPath.startsWith('..') || resolve(this.basePath, relPath) !== resolvedPath) {
        throw new Error(
          `Path traversal detected: ${worktreePath} resolves outside base path. ` +
          `Base path: ${this.basePath}, Resolved: ${resolvedPath}`
        );
      }
    } else {
      // No basePath configured, use worktreePath as-is
      resolvedPath = resolve(worktreePath);
    }

    return resolvedPath;
  }

  /**
   * Create a new development session with an iOS Simulator.
   *
   * Creates a fresh iOS Simulator, boots it, and associates it with the Flutter project directory.
   * Validates that the project path is within allowed directories and contains a valid Flutter project.
   *
   * @param params - Session creation parameters
   * @param params.worktreePath - Path to Flutter project directory (relative to basePath if configured, or absolute)
   * @param params.deviceType - iOS device type to simulate (default: "iPhone 16 Pro")
   *
   * @returns Session information including unique ID and simulator UDID
   *
   * @throws {Error} If session limit is reached
   * @throws {Error} If path traversal is detected
   * @throws {Error} If path is outside allowed prefix
   * @throws {Error} If project directory doesn't exist or isn't valid
   * @throws {Error} If simulator creation or boot fails
   *
   * @example
   * // With basePath set to /Users/alice/projects:
   * const session = await sessionManager.createSession({
   *   worktreePath: '/my-flutter-app',  // Resolves to /Users/alice/projects/my-flutter-app
   *   deviceType: 'iPhone 16 Pro'
   * });
   * // Returns: { id: 'uuid...', worktreePath: '...', simulatorUdid: '...', deviceType: '...' }
   */
  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const { worktreePath, deviceType = 'iPhone 16 Pro' } = params;

    logger.info('Creating session', { worktreePath, deviceType, basePath: this.basePath });

    // Check session limit
    if (sessionState.size() >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions (${String(this.maxSessions)}) reached. ` +
        `End an existing session before creating a new one. ` +
        `Active sessions: ${String(sessionState.size())}`
      );
    }

    // Resolve path (with basePath if configured) and protect against path traversal
    const resolvedPath = this.resolveWorktreePath(worktreePath);

    // Security: Validate path is within allowed prefix
    if (!resolvedPath.startsWith(this.allowedPathPrefix)) {
      throw new Error(
        `Access denied: Project path must be under ${this.allowedPathPrefix}. ` +
        `Provided path: ${worktreePath}, Resolved path: ${resolvedPath}`
      );
    }

    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Flutter project directory does not exist: ${resolvedPath}. ` +
        'Ensure the path is correct and accessible.'
      );
    }

    const stats = statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `Path is not a directory: ${resolvedPath}. ` +
        'Provide a path to a directory containing a Flutter project (with pubspec.yaml).'
      );
    }

    // Security: Validate it's a Flutter project by checking for pubspec.yaml
    const pubspecPath = join(resolvedPath, 'pubspec.yaml');
    if (!existsSync(pubspecPath)) {
      throw new Error(
        `Not a valid Flutter project (missing pubspec.yaml): ${resolvedPath}. ` +
        'The directory must contain a pubspec.yaml file.'
      );
    }

    const sessionId = uuidv4();

    const simulatorUdid = await createSimulator(deviceType);
    logger.debug('Simulator created', { simulatorUdid });

    await bootSimulator(simulatorUdid);
    logger.debug('Simulator booted', { simulatorUdid });

    const now = new Date();
    const session: Session = {
      id: sessionId,
      worktreePath: resolvedPath,  // Store the fully resolved path
      simulatorUdid,
      deviceType,
      createdAt: now,
      lastActivityAt: now,
    };

    sessionState.set(sessionId, session);

    logger.info('Session created', { sessionId, simulatorUdid, resolvedPath });

    return {
      id: session.id,
      worktreePath: session.worktreePath,
      simulatorUdid: session.simulatorUdid,
      deviceType: session.deviceType,
      createdAt: session.createdAt.toISOString(),
    };
  }

  async endSession(sessionId: string): Promise<void> {
    logger.info('Ending session', { sessionId });

    const session = sessionState.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.flutterProcessManager) {
      try {
        await session.flutterProcessManager.cleanup();
        logger.debug('Flutter process cleaned up', { sessionId });
      } catch (error) {
        logger.warn('Failed to cleanup Flutter process', {
          sessionId,
          error: String(error),
        });
      }
    }

    try {
      await shutdownSimulator(session.simulatorUdid);
      logger.debug('Simulator shutdown', { simulatorUdid: session.simulatorUdid });
    } catch (error) {
      logger.warn('Failed to shutdown simulator', {
        simulatorUdid: session.simulatorUdid,
        error: String(error),
      });
    }

    try {
      await deleteSimulator(session.simulatorUdid);
      logger.debug('Simulator deleted', { simulatorUdid: session.simulatorUdid });
    } catch (error) {
      logger.warn('Failed to delete simulator', {
        simulatorUdid: session.simulatorUdid,
        error: String(error),
      });
    }

    sessionState.delete(sessionId);
    logger.info('Session ended', { sessionId });
  }

  /**
   * List all active sessions.
   *
   * @returns Array of session information for all active sessions
   */
  listSessions(): SessionInfo[] {
    return sessionState.list();
  }

  /**
   * Get detailed information about a specific session.
   *
   * @param sessionId - Unique session identifier from createSession()
   * @returns Session object with full state, or undefined if not found
   */
  getSession(sessionId: string): Session | undefined {
    return sessionState.get(sessionId);
  }

  /**
   * Get all session IDs.
   *
   * @returns Array of all session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(sessionState.keys());
  }

  /**
   * Get the pre-build script command if configured.
   *
   * @returns Pre-build script command, or undefined if not set
   */
  getPreBuildScript(): string | undefined {
    return this.preBuildScript;
  }

  /**
   * Get the post-build script command if configured.
   *
   * @returns Post-build script command, or undefined if not set
   */
  getPostBuildScript(): string | undefined {
    return this.postBuildScript;
  }

  /**
   * Update the last activity timestamp for a session.
   * Called whenever a tool is used on the session.
   *
   * @param sessionId - Session ID to update
   */
  updateSessionActivity(sessionId: string): void {
    const session = sessionState.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      logger.debug('Session activity updated', { sessionId });
    }
  }

  /**
   * Start monitoring sessions for inactivity timeout.
   * Checks every minute for sessions that have exceeded the timeout.
   */
  private startTimeoutMonitoring(): void {
    // Clear any existing interval
    if (this.timeoutCheckIntervalId) {
      clearInterval(this.timeoutCheckIntervalId);
    }

    if (!this.sessionTimeoutMinutes) {
      return;
    }

    logger.info('Starting session timeout monitoring', {
      timeoutMinutes: this.sessionTimeoutMinutes,
      checkInterval: '60 seconds',
    });

    // Check every minute for inactive sessions
    this.timeoutCheckIntervalId = setInterval(() => {
      this.checkAndCleanupInactiveSessions().catch((error: unknown) => {
        logger.error('Error checking inactive sessions', { error: String(error) });
      });
    }, 60000); // 60 seconds
  }

  /**
   * Check for inactive sessions and clean them up if they've exceeded the timeout.
   */
  private async checkAndCleanupInactiveSessions(): Promise<void> {
    if (!this.sessionTimeoutMinutes) {
      return;
    }

    const now = new Date();
    const timeoutMs = this.sessionTimeoutMinutes * 60 * 1000;
    const sessions = sessionState.list();

    for (const sessionInfo of sessions) {
      const session = sessionState.get(sessionInfo.id);
      if (!session) {
        continue;
      }

      const inactiveMs = now.getTime() - session.lastActivityAt.getTime();

      if (inactiveMs > timeoutMs) {
        const inactiveMinutes = Math.floor(inactiveMs / 60000);
        logger.info('Session timeout: ending inactive session', {
          sessionId: session.id,
          inactiveMinutes,
          timeoutMinutes: this.sessionTimeoutMinutes,
        });

        try {
          await this.endSession(session.id);
        } catch (error) {
          logger.error('Failed to end inactive session', {
            sessionId: session.id,
            error: String(error),
          });
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sessions');

    // Stop timeout monitoring
    if (this.timeoutCheckIntervalId) {
      clearInterval(this.timeoutCheckIntervalId);
      this.timeoutCheckIntervalId = undefined;
    }

    const sessions = sessionState.list();

    for (const session of sessions) {
      try {
        await this.endSession(session.id);
      } catch (error) {
        logger.error('Failed to end session during cleanup', {
          sessionId: session.id,
          error: String(error),
        });
      }
    }
  }
}

export const sessionManager = new SessionManager();
