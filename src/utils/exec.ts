import { exec as nodeExec, execFile as nodeExecFile, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(nodeExec);
const execFileAsync = promisify(nodeExecFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

export async function exec(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd, timeout = 30000, env, maxBuffer = 10 * 1024 * 1024 } = options;

  logger.debug('Executing command', { command, cwd });

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      env: { ...process.env, ...env },
      maxBuffer,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const execError = error as {
        stdout?: Buffer | string;
        stderr?: Buffer | string;
        code?: number;
        signal?: string;
      };

      const stdout = typeof execError.stdout === 'string'
        ? execError.stdout
        : execError.stdout?.toString() ?? '';
      const stderr = typeof execError.stderr === 'string'
        ? execError.stderr
        : execError.stderr?.toString() ?? '';

      return {
        stdout,
        stderr,
        exitCode: execError.code ?? 1,
      };
    }
    throw error;
  }
}

/**
 * Execute a file with arguments (safer than exec - no shell injection)
 */
export async function execFile(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd, timeout = 30000, env, maxBuffer = 10 * 1024 * 1024 } = options;

  logger.debug('Executing file', { command, args, cwd });

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      env: { ...process.env, ...env },
      maxBuffer,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const execError = error as {
        stdout?: Buffer | string;
        stderr?: Buffer | string;
        code?: number;
        signal?: string;
      };

      const stdout = typeof execError.stdout === 'string'
        ? execError.stdout
        : execError.stdout?.toString() ?? '';
      const stderr = typeof execError.stderr === 'string'
        ? execError.stderr
        : execError.stderr?.toString() ?? '';

      return {
        stdout,
        stderr,
        exitCode: execError.code ?? 1,
      };
    }
    throw error;
  }
}

export interface SpawnStreamOptions extends ExecOptions {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onExit?: (code: number | null, signal: string | null) => void;
}

export interface SpawnedProcess {
  pid: number | undefined;
  stdin: NodeJS.WritableStream;
  kill: (signal?: NodeJS.Signals) => boolean;
  wait: () => Promise<number>;
}

export function spawnStreaming(
  command: string,
  args: string[],
  options: SpawnStreamOptions = {}
): SpawnedProcess {
  const { cwd, env, onStdout, onStderr, onExit } = options;

  logger.debug('Spawning process', { command, args, cwd });

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data: Buffer) => {
    const str = data.toString();
    logger.debug('Process stdout', { pid: child.pid, data: str });
    onStdout?.(str);
  });

  child.stderr.on('data', (data: Buffer) => {
    const str = data.toString();
    logger.debug('Process stderr', { pid: child.pid, data: str });
    onStderr?.(str);
  });

  const waitPromise = new Promise<number>((resolve) => {
    child.on('exit', (code, signal) => {
      logger.debug('Process exited', { pid: child.pid, code, signal });
      onExit?.(code, signal);
      resolve(code ?? 1);
    });
  });

  return {
    pid: child.pid,
    stdin: child.stdin,
    kill: (signal?: NodeJS.Signals) => child.kill(signal),
    wait: () => waitPromise,
  };
}
