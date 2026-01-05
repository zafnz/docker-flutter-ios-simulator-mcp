import { FlutterProcessManager } from '../flutter/process.js';
import { FlutterTestManager } from '../flutter/test-manager.js';

export interface Session {
  id: string;
  worktreePath: string;
  simulatorUdid: string;
  deviceType: string;
  createdAt: Date;
  lastActivityAt: Date;
  flutterProcessManager?: FlutterProcessManager;
  testManager?: FlutterTestManager;
}

export interface CreateSessionParams {
  worktreePath: string;
  deviceType?: string;
}

export interface SessionInfo {
  id: string;
  worktreePath: string;
  simulatorUdid: string;
  deviceType: string;
  createdAt: string;
  flutterProcess?: {
    pid: number;
    status: string;
    startedAt: string;
  };
}
