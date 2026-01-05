import { z } from 'zod';
import { sessionManager } from '../session/manager.js';
import { FlutterTestManager } from '../flutter/test-manager.js';
import { logger } from '../utils/logger.js';

// Zod schemas for tool inputs
export const flutterTestSchema = z.object({
  sessionId: z.string().describe('Session ID'),
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
    .describe('Include arrays of all passing and failing test names'),
});

export const flutterTestLogsSchema = z.object({
  reference: z.number().describe('Test run reference ID'),
  showAll: z
    .boolean()
    .optional()
    .describe('Show all test logs (default: false, shows only failures)'),
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

  // Start the test run
  const reference = session.testManager.start({
    worktreePath: session.worktreePath,
    testNameMatch: args.testNameMatch,
    timeout: args.timeout ?? 10, // Default 10 minutes
    tags: args.tags,
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

  const progress = testManager.getProgress(args.reference, args.showAllTestNames ?? false);
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

  const logs = testManager.getLogs(args.reference, args.showAll ?? false);

  // Map to snake_case as per spec
  return logs.map((log) => ({
    test_name: log.testName,
    output: log.output,
  }));
}
