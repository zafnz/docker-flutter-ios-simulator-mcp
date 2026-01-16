import { z } from 'zod';
import { sessionManager } from '../session/manager.js';
import { FlutterTestManager } from '../flutter/test-manager.js';
import { logger } from '../utils/logger.js';

// Zod schemas for tool inputs
export const flutterTestSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  testTarget: z
    .string()
    .optional()
    .describe(
      'Specific test file or directory to run (e.g., "test/widget_test.dart" or "test/unit/"). Path must be relative to project root.'
    ),
  testNameMatch: z
    .string()
    .optional()
    .describe('Regular expression to match test names (limits which tests run)'),
  timeout: z.number().optional().describe('Timeout in minutes (default: 10)'),
  tags: z.array(z.string()).optional().describe('Only run tests with specified tags'),
});

export const flutterTestResultsSchema = z.object({
  reference: z.number().describe('Test run reference ID'),
  showAllTestNames: z
    .boolean()
    .optional()
    .describe('Include arrays of passing and failing test names (paginated)'),
  offset: z
    .number()
    .optional()
    .describe('Starting index for paginated test names (default: 0)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of test names to return per page (default: 100)'),
});

export const flutterTestLogsSchema = z.object({
  reference: z.number().describe('Test run reference ID'),
  showAll: z
    .boolean()
    .optional()
    .describe('Show all test logs (default: false, shows only failures)'),
  offset: z
    .number()
    .optional()
    .describe('Starting index for paginated logs (default: 0)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of log entries to return (default: 100)'),
});

// Tool handlers
export function handleFlutterTest(
  args: z.infer<typeof flutterTestSchema>
): { reference: number } {
  logger.info('Tool: flutter_test', args);

  const session = sessionManager.getSession(args.sessionId);
  if (!session) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }

  // Update session activity
  sessionManager.updateSessionActivity(args.sessionId);

  // Create test manager if it doesn't exist
  if (!session.testManager) {
    session.testManager = new FlutterTestManager();
  }

  // Validate testTarget if provided
  if (args.testTarget) {
    // Prevent directory traversal
    if (args.testTarget.includes('..')) {
      throw new Error('testTarget cannot contain ".." (directory traversal not allowed)');
    }
    // Prevent absolute paths
    if (args.testTarget.startsWith('/')) {
      throw new Error('testTarget must be a relative path');
    }
  }

  // Start the test run
  const reference = session.testManager.start({
    worktreePath: session.worktreePath,
    testTarget: args.testTarget,
    testNameMatch: args.testNameMatch,
    timeout: args.timeout ?? 10, // Default 10 minutes
    tags: args.tags,
    deviceId: session.simulatorUdid,
  });

  return { reference };
}

export function handleFlutterTestResults(
  args: z.infer<typeof flutterTestResultsSchema>
): {
  reference: number;
  tests_complete: number;
  tests_total: number;
  passes: number;
  fails: number;
  complete: boolean;
  passingTests?: string[];
  failingTests?: string[];
} {
  logger.info('Tool: flutter_test_results', args);

  // Find the session that has this test reference
  let testManager: FlutterTestManager | undefined;
  for (const sessionId of sessionManager.getAllSessionIds()) {
    const session = sessionManager.getSession(sessionId);
    if (session?.testManager) {
      const refs = session.testManager.getAllReferences();
      if (refs.includes(args.reference)) {
        testManager = session.testManager;
        sessionManager.updateSessionActivity(sessionId);
        break;
      }
    }
  }

  if (!testManager) {
    throw new Error(`Test reference not found: ${String(args.reference)}`);
  }

  const offset = args.offset ?? 0;
  const limit = args.limit ?? 100;

  const progress = testManager.getProgress(
    args.reference,
    args.showAllTestNames ?? false,
    offset,
    limit
  );
  if (!progress) {
    throw new Error(`Test reference not found: ${String(args.reference)}`);
  }

  // Map to snake_case as per spec
  const result: {
    reference: number;
    tests_complete: number;
    tests_total: number;
    passes: number;
    fails: number;
    complete: boolean;
    passingTests?: string[];
    failingTests?: string[];
    totalPassingTests?: number;
    totalFailingTests?: number;
    hasMorePassing?: boolean;
    hasMoreFailing?: boolean;
  } = {
    reference: progress.reference,
    tests_complete: progress.testsComplete,
    tests_total: progress.testsTotal,
    passes: progress.passes,
    fails: progress.fails,
    complete: progress.complete,
  };

  if (args.showAllTestNames) {
    result.passingTests = progress.passingTests;
    result.failingTests = progress.failingTests;
    result.totalPassingTests = progress.totalPassingTests;
    result.totalFailingTests = progress.totalFailingTests;
    result.hasMorePassing = progress.hasMorePassing;
    result.hasMoreFailing = progress.hasMoreFailing;
  }

  return result;
}

export function handleFlutterTestLogs(
  args: z.infer<typeof flutterTestLogsSchema>
): Array<{ test_name: string; output: string }> {
  logger.info('Tool: flutter_test_logs', args);

  // Find the session that has this test reference
  let testManager: FlutterTestManager | undefined;
  for (const sessionId of sessionManager.getAllSessionIds()) {
    const session = sessionManager.getSession(sessionId);
    if (session?.testManager) {
      const refs = session.testManager.getAllReferences();
      if (refs.includes(args.reference)) {
        testManager = session.testManager;
        sessionManager.updateSessionActivity(sessionId);
        break;
      }
    }
  }

  if (!testManager) {
    throw new Error(`Test reference not found: ${String(args.reference)}`);
  }

  const offset = args.offset ?? 0;
  const limit = args.limit ?? 100;

  const logs = testManager.getLogs(args.reference, args.showAll ?? false, offset, limit);

  // Map to snake_case as per spec
  return logs.map((log) => ({
    test_name: log.testName,
    output: log.output,
  }));
}
