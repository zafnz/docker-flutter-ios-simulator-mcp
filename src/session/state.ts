import { Session, SessionInfo } from './types.js';

class SessionState {
  private sessions: Map<string, Session> = new Map();

  set(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, session);
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => {
      const flutterStatus = session.flutterProcessManager?.getStatus();

      return {
        id: session.id,
        worktreePath: session.worktreePath,
        simulatorUdid: session.simulatorUdid,
        deviceType: session.deviceType,
        createdAt: session.createdAt.toISOString(),
        flutterProcess: flutterStatus
          ? {
              pid: flutterStatus.pid,
              status: flutterStatus.status,
              startedAt: flutterStatus.startedAt.toISOString(),
            }
          : undefined,
      };
    });
  }

  clear(): void {
    this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }

  keys(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export const sessionState = new SessionState();
