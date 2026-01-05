import { spawnStreaming, SpawnedProcess } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import {
  FlutterTestOptions,
  FlutterTestState,
  FlutterTestProgress,
  FlutterTestLog,
  TestStartEvent,
  TestDoneEvent,
  ErrorEvent,
  PrintEvent,
  DoneEvent,
} from './test-types.js';

export class FlutterTestManager {
  private process?: SpawnedProcess;
  private testStates: Map<number, FlutterTestState> = new Map();
  private nextReference = 1;

  start(options: FlutterTestOptions): number {
    logger.info('Starting Flutter test', {
      worktreePath: options.worktreePath,
      testNameMatch: options.testNameMatch,
      tags: options.tags,
      timeout: options.timeout,
    });

    const reference = this.nextReference++;
    const state: FlutterTestState = {
      reference,
      startedAt: new Date(),
      tests: new Map(),
      testNames: new Map(),
      totalTests: 0,
      complete: false,
      outputBuffer: [],
    };

    this.testStates.set(reference, state);

    const args = ['test', '--reporter', 'json'];

    // Add test name filter
    if (options.testNameMatch) {
      args.push('--name', options.testNameMatch);
    }

    // Add tags filter
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        args.push('--tags', tag);
      }
    }

    // Add timeout
    if (options.timeout) {
      // Convert minutes to seconds
      const timeoutSeconds = options.timeout * 60;
      args.push('--timeout', `${String(timeoutSeconds)}s`);
    }

    this.process = spawnStreaming('flutter', args, {
      cwd: options.worktreePath,
      onStdout: (data) => {
        this.handleOutput(reference, data);
      },
      onStderr: (data) => {
        // Also capture stderr for any error messages
        this.handleStderr(reference, data);
      },
      onExit: (code, signal) => {
        this.handleExit(reference, code, signal);
      },
    });

    logger.info('Flutter test process started', { reference, pid: this.process.pid });

    return reference;
  }

  private handleOutput(reference: number, data: string): void {
    const state = this.testStates.get(reference);
    if (!state) return;

    const lines = data.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Store raw output
      state.outputBuffer.push(line);

      // Try to parse as JSON event
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        this.processEvent(reference, event);
      } catch {
        // Not JSON, just regular output
        logger.debug('Non-JSON test output', { line });
      }
    }
  }

  private handleStderr(reference: number, data: string): void {
    const state = this.testStates.get(reference);
    if (!state) return;

    const lines = data.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        state.outputBuffer.push(`[stderr] ${line}`);
      }
    }
  }

  private processEvent(reference: number, event: Record<string, unknown>): void {
    const state = this.testStates.get(reference);
    if (!state) return;

    const eventType = event.type as string;

    switch (eventType) {
      case 'start':
        logger.debug('Test run started', { reference });
        break;

      case 'allSuites':
        state.totalTests = (event.count as number) || 0;
        logger.debug('Total test suites', { count: state.totalTests });
        break;

      case 'testStart': {
        const testEvent = event as unknown as TestStartEvent;
        const testId = testEvent.test.id;
        const testName = testEvent.test.name;

        state.testNames.set(testId, testName);

        // Initialize test result
        if (!state.tests.has(testId)) {
          state.tests.set(testId, {
            testId,
            testName,
            result: 'success',
            skipped: false,
            hidden: testEvent.test.metadata.skip,
            output: [],
          });
        }

        logger.debug('Test started', { testId, testName });
        break;
      }

      case 'testDone': {
        const testEvent = event as unknown as TestDoneEvent;
        const testId = testEvent.testID;
        const test = state.tests.get(testId);

        if (test) {
          test.result = testEvent.result === 'success' ? 'success' : testEvent.result;
          test.skipped = testEvent.skipped;
          test.hidden = testEvent.hidden;
        }

        logger.debug('Test done', {
          testId,
          result: testEvent.result,
          skipped: testEvent.skipped,
        });
        break;
      }

      case 'error': {
        const errorEvent = event as unknown as ErrorEvent;
        const testId = errorEvent.testID;
        const test = state.tests.get(testId);

        if (test) {
          test.result = errorEvent.isFailure ? 'failure' : 'error';
          test.output.push(errorEvent.error);
          if (errorEvent.stackTrace) {
            test.output.push(errorEvent.stackTrace);
          }
        }

        logger.debug('Test error', { testId, error: errorEvent.error });
        break;
      }

      case 'print': {
        const printEvent = event as unknown as PrintEvent;
        const testId = printEvent.testID;
        const test = state.tests.get(testId);

        if (test) {
          test.output.push(printEvent.message);
        }
        break;
      }

      case 'done': {
        const doneEvent = event as unknown as DoneEvent;
        state.complete = true;
        state.success = doneEvent.success;
        state.completedAt = new Date();

        logger.info('Test run complete', {
          reference,
          success: doneEvent.success,
          totalTests: state.tests.size,
        });
        break;
      }

      default:
        // Ignore other event types (group, suite, etc.)
        break;
    }
  }

  private handleExit(reference: number, code: number | null, signal: string | null): void {
    const state = this.testStates.get(reference);
    if (!state) return;

    logger.info('Flutter test process exited', { reference, code, signal });

    if (!state.complete) {
      state.complete = true;
      state.completedAt = new Date();
      state.success = code === 0;
    }

    this.process = undefined;
  }

  getProgress(reference: number, showAllTestNames = false): FlutterTestProgress | null {
    const state = this.testStates.get(reference);
    if (!state) {
      return null;
    }

    // Count tests (excluding hidden tests like suite loading tests)
    const visibleTests = Array.from(state.tests.values()).filter((t) => !t.hidden);
    const passes = visibleTests.filter((t) => t.result === 'success' && !t.skipped).length;
    const fails = visibleTests.filter(
      (t) => (t.result === 'failure' || t.result === 'error') && !t.skipped
    ).length;

    const progress: FlutterTestProgress = {
      reference,
      testsComplete: visibleTests.filter((t) => !t.skipped).length,
      testsTotal: visibleTests.length,
      passes,
      fails,
      complete: state.complete,
    };

    if (showAllTestNames) {
      progress.passingTests = visibleTests
        .filter((t) => t.result === 'success' && !t.skipped)
        .map((t) => t.testName);

      progress.failingTests = visibleTests
        .filter((t) => (t.result === 'failure' || t.result === 'error') && !t.skipped)
        .map((t) => t.testName);
    }

    return progress;
  }

  getLogs(reference: number, showAll = false): FlutterTestLog[] {
    const state = this.testStates.get(reference);
    if (!state) {
      return [];
    }

    const visibleTests = Array.from(state.tests.values()).filter((t) => !t.hidden);

    const testsToShow = showAll
      ? visibleTests
      : visibleTests.filter((t) => t.result === 'failure' || t.result === 'error');

    return testsToShow.map((test) => ({
      testName: test.testName,
      output: test.output.join('\n'),
    }));
  }

  cleanup(reference?: number): void {
    if (reference !== undefined) {
      this.testStates.delete(reference);
      logger.debug('Cleaned up test state', { reference });
    } else {
      this.testStates.clear();
      logger.debug('Cleaned up all test states');
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = undefined;
    }
  }

  getAllReferences(): number[] {
    return Array.from(this.testStates.keys());
  }
}
