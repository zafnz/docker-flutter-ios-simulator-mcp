import { v4 as uuidv4 } from 'uuid';
import { existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { sessionState } from './state.js';
import { CreateSessionParams, Session, SessionInfo } from './types.js';
import { logger } from '../utils/logger.js';
import { createSimulator, bootSimulator, shutdownSimulator, deleteSimulator } from '../simulator/simctl.js';

export class SessionManager {
  private allowedPathPrefix: string;

  constructor(allowedPathPrefix = '/Users/') {
    this.allowedPathPrefix = allowedPathPrefix;
  }

  configure(allowedPathPrefix: string): void {
    this.allowedPathPrefix = allowedPathPrefix;
    logger.info('SessionManager configured', { allowedPathPrefix });
  }

  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const { worktreePath, deviceType = 'iPhone 16 Pro' } = params;

    logger.info('Creating session', { worktreePath, deviceType });

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

  listSessions(): SessionInfo[] {
    return sessionState.list();
  }

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
