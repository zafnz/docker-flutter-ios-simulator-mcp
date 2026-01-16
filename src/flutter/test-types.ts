// Types for Flutter test functionality

export interface FlutterTestOptions {
  worktreePath: string;
  testTarget?: string; // specific test file or directory (relative to project root)
  testNameMatch?: string; // --name flag (regex)
  timeout?: number; // timeout in minutes
  tags?: string[]; // --tags flag
  deviceId?: string; // --device flag (simulator UDID)
}

export interface FlutterTestEvent {
  type: string;
  time: number;
  [key: string]: unknown;
}

export interface TestStartEvent extends FlutterTestEvent {
  type: 'testStart';
  test: {
    id: number;
    name: string;
    suiteID: number;
    groupIDs: number[];
    metadata: {
      skip: boolean;
      skipReason: string | null;
    };
    line: number | null;
    column: number | null;
    url: string | null;
    root_line?: number;
    root_column?: number;
    root_url?: string;
  };
}

export interface TestDoneEvent extends FlutterTestEvent {
  type: 'testDone';
  testID: number;
  result: 'success' | 'failure' | 'error';
  skipped: boolean;
  hidden: boolean;
}

export interface ErrorEvent extends FlutterTestEvent {
  type: 'error';
  testID: number;
  error: string;
  stackTrace: string;
  isFailure: boolean;
}

export interface PrintEvent extends FlutterTestEvent {
  type: 'print';
  testID: number;
  message: string;
  messageType: 'print' | 'skip';
}

export interface DoneEvent extends FlutterTestEvent {
  type: 'done';
  success: boolean;
}

export interface TestResult {
  testId: number;
  testName: string;
  result: 'success' | 'failure' | 'error';
  skipped: boolean;
  hidden: boolean;
  output: string[]; // Collected error messages and prints
}

export interface FlutterTestProgress {
  reference: number;
  testsComplete: number;
  testsTotal: number;
  passes: number;
  fails: number;
  complete: boolean;
  passingTests?: string[];
  failingTests?: string[];
  totalPassingTests?: number;
  totalFailingTests?: number;
  hasMorePassing?: boolean;
  hasMoreFailing?: boolean;
}

export interface FlutterTestLog {
  testName: string;
  output: string;
}

export interface FlutterTestState {
  reference: number;
  startedAt: Date;
  completedAt?: Date;
  tests: Map<number, TestResult>;
  testNames: Map<number, string>;
  totalTests: number;
  complete: boolean;
  success?: boolean;
  outputBuffer: string[]; // Raw output lines
}
