import { spawnStreaming, SpawnedProcess } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { LogBuffer } from './log-buffer.js';
import { FlutterProcess, FlutterRunOptions } from './types.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

export class FlutterProcessManager {
  private process?: SpawnedProcess;
  private flutterProcess?: FlutterProcess;
  private logBuffer: LogBuffer;
  private logSubscribers: Set<(line: string) => void> = new Set();

  constructor(maxLogLines = 1000) {
    this.logBuffer = new LogBuffer(maxLogLines);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async start(options: FlutterRunOptions): Promise<FlutterProcess> {
    if (this.process) {
      throw new Error('Flutter process already running');
    }

    logger.info('Starting Flutter process', {
      worktreePath: options.worktreePath,
      deviceId: options.deviceId,
    });

    // Security: Validate target file
    // Prevents malicious clients from accessing arbitrary files on the system
    if (options.target) {
      const targetPath = resolve(options.worktreePath, options.target);

      // Prevent path traversal attacks (e.g., "../../../etc/passwd")
      // Ensures the target file is within the project directory boundary
      if (!targetPath.startsWith(resolve(options.worktreePath))) {
        throw new Error(
          `Security: Target file must be within project directory. ` +
          `Target: ${options.target}`
        );
      }

      // Validate file exists to provide early feedback
      if (!existsSync(targetPath)) {
        throw new Error(`Target file does not exist: ${options.target}`);
      }

      // Only .dart files are valid Flutter entry points
      // Prevents attempts to execute arbitrary file types
      if (!targetPath.endsWith('.dart')) {
        throw new Error(
          `Target must be a Dart file (.dart extension). ` +
          `Provided: ${options.target}`
        );
      }
    }

    // Security: Validate flavor name
    // Prevents command injection through flavor parameter
    if (options.flavor) {
      // Only allow safe characters that cannot break shell command parsing
      if (!/^[a-zA-Z0-9_-]+$/.test(options.flavor)) {
        throw new Error(
          `Invalid flavor name: ${options.flavor}. ` +
          `Flavor must contain only letters, numbers, hyphens, and underscores.`
        );
      }
    }

    // Security: Validate additionalArgs against allowlist
    // Prevents command injection by only allowing known-safe Flutter arguments
    // This protects against malicious arguments like "--dart-define=KEY=$(rm -rf /)"
    if (options.additionalArgs) {
      const ALLOWED_ARGS = new Set([
        '--debug',
        '--release',
        '--profile',
        '--no-sound-null-safety',
        '--enable-software-rendering',
        '--verbose',
        '-v',
      ]);

      for (const arg of options.additionalArgs) {
        // Check if argument is in the allowlist
        if (ALLOWED_ARGS.has(arg)) {
          continue;
        }

        // Validate --dart-define format more strictly to prevent injection
        // Example attack prevented: --dart-define=X=$(malicious_command)
        if (arg.startsWith('--dart-define=')) {
          const defineValue = arg.substring('--dart-define='.length);
          // Enforce KEY=VALUE where KEY follows identifier rules (alphanumeric/underscore)
          // This prevents shell metacharacters and command substitution
          if (!/^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(defineValue)) {
            throw new Error(
              `Invalid --dart-define format: ${arg}. ` +
              `Expected --dart-define=KEY=VALUE where KEY is alphanumeric/underscore starting with letter or underscore`
            );
          }
          continue;
        }

        // If we get here, argument is not allowed - reject it
        throw new Error(
          `Invalid Flutter argument: ${arg}. ` +
          `Allowed arguments: ${Array.from(ALLOWED_ARGS).join(', ')}, --dart-define=KEY=VALUE`
        );
      }
    }

    const args = ['run', '-d', options.deviceId];

    if (options.target) {
      args.push('-t', options.target);
    }

    if (options.flavor) {
      args.push('--flavor', options.flavor);
    }

    if (options.additionalArgs) {
      args.push(...options.additionalArgs);
    }

    this.flutterProcess = {
      pid: 0,
      status: 'starting',
      startedAt: new Date(),
    };

    this.process = spawnStreaming('flutter', args, {
      cwd: options.worktreePath,
      onStdout: (data) => {
        this.handleOutput(data);
      },
      onStderr: (data) => {
        this.handleOutput(data);
      },
      onExit: (code, signal) => {
        this.handleExit(code, signal);
      },
    });

    if (this.process.pid) {
      this.flutterProcess.pid = this.process.pid;
      this.flutterProcess.status = 'running';
      logger.info('Flutter process started', { pid: this.process.pid });
    }

    return this.flutterProcess;
  }

  private handleOutput(data: string): void {
    const lines = data.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        this.logBuffer.append(line);

        this.logSubscribers.forEach((subscriber) => {
          try {
            subscriber(line);
          } catch (error) {
            logger.error('Error in log subscriber', { error: String(error) });
          }
        });

        this.detectStatusChanges(line);
      }
    }
  }

  private detectStatusChanges(line: string): void {
    if (!this.flutterProcess) return;

    if (line.includes('Hot reload') || line.includes('Reloaded')) {
      this.flutterProcess.status = 'hot-reloading';
      setTimeout(() => {
        if (this.flutterProcess) {
          this.flutterProcess.status = 'running';
        }
      }, 1000);
    }
  }

  private handleExit(code: number | null, signal: string | null): void {
    logger.info('Flutter process exited', { code, signal });

    if (this.flutterProcess) {
      this.flutterProcess.status = code === 0 ? 'stopped' : 'failed';
      this.flutterProcess.stoppedAt = new Date();
      this.flutterProcess.exitCode = code ?? undefined;
    }

    this.process = undefined;
  }

  stop(): boolean {
    if (!this.process) {
      logger.warn('No Flutter process to stop');
      return false;
    }

    logger.info('Stopping Flutter process', { pid: this.process.pid });

    this.process.stdin.write('q\n');
    this.process.stdin.end();

    return true;
  }

  hotReload(): boolean {
    if (!this.process) {
      logger.warn('No Flutter process for hot reload');
      return false;
    }

    logger.info('Triggering hot reload', { pid: this.process.pid });
    this.process.stdin.write('r\n');

    return true;
  }

  hotRestart(): boolean {
    if (!this.process) {
      logger.warn('No Flutter process for hot restart');
      return false;
    }

    logger.info('Triggering hot restart', { pid: this.process.pid });
    this.process.stdin.write('R\n');

    return true;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (!this.process) {
      return false;
    }

    logger.info('Killing Flutter process', { pid: this.process.pid, signal });
    return this.process.kill(signal);
  }

  getStatus(): FlutterProcess | undefined {
    return this.flutterProcess;
  }

  getLogs(fromIndex?: number, limit?: number): {
    logs: Array<{ line: string; timestamp: Date; index: number }>;
    nextIndex: number;
    totalLines: number;
  } {
    const logs = this.logBuffer.getLogs(fromIndex, limit);
    return {
      logs,
      nextIndex: this.logBuffer.getNextIndex(),
      totalLines: this.logBuffer.getTotalLines(),
    };
  }

  subscribeToLogs(callback: (line: string) => void): () => void {
    this.logSubscribers.add(callback);

    return () => {
      this.logSubscribers.delete(callback);
    };
  }

  clearLogs(): void {
    this.logBuffer.clear();
  }

  async cleanup(): Promise<void> {
    logger.debug('Cleaning up Flutter process manager');

    this.logSubscribers.clear();

    // Capture process reference to avoid race condition
    const currentProcess = this.process;
    if (currentProcess) {
      this.stop();

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn('Flutter process did not stop gracefully, killing');
          this.kill('SIGKILL');
          resolve();
        }, 5000);

        currentProcess.wait().then(() => {
          clearTimeout(timeout);
          resolve();
        }).catch((error: unknown) => {
          logger.error('Error waiting for process', { error: String(error) });
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.clearLogs();
  }
}
