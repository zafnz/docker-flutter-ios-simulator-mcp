import { v4 as uuidv4 } from 'uuid';
import { existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { sessionState } from './state.js';
import { CreateSessionParams, Session, SessionInfo } from './types.js';
import { logger } from '../utils/logger.js';
import { createSimulator, bootSimulator, shutdownSimulator, deleteSimulator } from '../simulator/simctl.js';

export class SessionManager {
  private allowedPathPrefix: string;
  private maxSessions: number;

  constructor(allowedPathPrefix = '/Users/', maxSessions = 10) {
    this.allowedPathPrefix = allowedPathPrefix;
    this.maxSessions = maxSessions;
  }

  /**
   * Configure the session manager with security settings.
   *
   * @param allowedPathPrefix - Absolute path prefix for allowed Flutter projects (e.g., "/Users/")
   * @param maxSessions - Optional maximum number of concurrent sessions
   *
   * @example
   * sessionManager.configure('/Users/alice/projects', 20);
   */
  configure(allowedPathPrefix: string, maxSessions?: number): void {
    this.allowedPathPrefix = allowedPathPrefix;
    if (maxSessions !== undefined) {
      this.maxSessions = maxSessions;
      logger.info('SessionManager configured', { allowedPathPrefix, maxSessions });
    } else {
      logger.info('SessionManager configured', { allowedPathPrefix });
    }
  }

  /**
   * Create a new development session with an iOS Simulator.
   *
   * Creates a fresh iOS Simulator, boots it, and associates it with the Flutter project directory.
   * Validates that the project path is within allowed directories and contains a valid Flutter project.
   *
   * @param params - Session creation parameters
   * @param params.worktreePath - Absolute path to Flutter project directory (must contain pubspec.yaml)
   * @param params.deviceType - iOS device type to simulate (default: "iPhone 16 Pro")
   *
   * @returns Session information including unique ID and simulator UDID
   *
   * @throws {Error} If session limit is reached
   * @throws {Error} If path is outside allowed prefix
   * @throws {Error} If project directory doesn't exist or isn't valid
   * @throws {Error} If simulator creation or boot fails
   *
   * @example
   * const session = await sessionManager.createSession({
   *   worktreePath: '/Users/alice/my-flutter-app',
   *   deviceType: 'iPhone 16 Pro'
   * });
   * // Returns: { id: 'uuid...', worktreePath: '...', simulatorUdid: '...', deviceType: '...' }
   */
  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const { worktreePath, deviceType = 'iPhone 16 Pro' } = params;

    logger.info('Creating session', { worktreePath, deviceType });

    // Check session limit
    if (sessionState.size() >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions (${String(this.maxSessions)}) reached. ` +
        `End an existing session before creating a new one. ` +
        `Active sessions: ${String(sessionState.size())}`
      );
    }

    // Validate project path exists and is a directory
    const resolvedPath = resolve(worktreePath);

    // Security: Validate path is within allowed prefix
    if (!resolvedPath.startsWith(this.allowedPathPrefix)) {
      throw new Error(
        `Access denied: Project path must be under ${this.allowedPathPrefix}. ` +
        `Provided path: ${resolvedPath}`
      );
    }

    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Flutter project directory does not exist: ${worktreePath}. ` +
        'Ensure the path is correct and accessible.'
      );
    }

    const stats = statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `Path is not a directory: ${worktreePath}. ` +
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

    const session: Session = {
      id: sessionId,
      worktreePath,
      simulatorUdid,
      deviceType,
      createdAt: new Date(),
    };

    sessionState.set(sessionId, session);

    logger.info('Session created', { sessionId, simulatorUdid });

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

  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sessions');
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
