import { execFile } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface TapOptions {
  x: number;
  y: number;
  duration?: number; // for long press
}

export interface SwipeOptions {
  x_start: number;
  y_start: number;
  x_end: number;
  y_end: number;
  duration?: number; // swipe duration in seconds
}

export interface ScreenshotResult {
  path: string;
  imageData: string;
  format: string;
}

/**
 * Tap at coordinates on the simulator screen
 */
export async function tap(udid: string, options: TapOptions): Promise<void> {
  logger.debug('IDB tap', { udid, ...options });

  const args = ['ui', 'tap', '--udid', udid, String(options.x), String(options.y)];

  if (options.duration) {
    args.push('--duration', String(options.duration));
  }

  const { exitCode, stderr } = await execFile('idb', args, { timeout: 10000 });

  if (exitCode !== 0) {
    throw new Error(
      `Failed to tap at (${String(options.x)}, ${String(options.y)}) on simulator ${udid}: ${stderr}. ` +
      'Ensure the simulator is booted and IDB companion is running.'
    );
  }

  logger.info('Tap executed', { udid, ...options });
}

/**
 * Input text into the focused field
 */
export async function typeText(udid: string, text: string): Promise<void> {
  logger.debug('IDB text input', { udid, text });

  const { exitCode, stderr } = await execFile(
    'idb',
    ['ui', 'text', '--udid', udid, text],
    { timeout: 10000 }
  );

  if (exitCode !== 0) {
    throw new Error(
      `Failed to type text on simulator ${udid}: ${stderr}. ` +
      'Ensure a text field is focused and the simulator is responsive.'
    );
  }

  logger.info('Text input executed', { udid, textLength: text.length });
}

/**
 * Swipe from one point to another
 */
export async function swipe(udid: string, options: SwipeOptions): Promise<void> {
  logger.debug('IDB swipe', { udid, ...options });

  const args = [
    'ui',
    'swipe',
    '--udid',
    udid,
    String(options.x_start),
    String(options.y_start),
    String(options.x_end),
    String(options.y_end),
  ];

  if (options.duration) {
    args.push('--duration', String(options.duration));
  }

  const { exitCode, stderr } = await execFile('idb', args, { timeout: 10000 });

  if (exitCode !== 0) {
    throw new Error(
      `Failed to swipe from (${String(options.x_start)}, ${String(options.y_start)}) to (${String(options.x_end)}, ${String(options.y_end)}) on simulator ${udid}: ${stderr}. ` +
      'Ensure the simulator is booted and responsive.'
    );
  }

  logger.info('Swipe executed', { udid, ...options });
}

/**
 * Get accessibility tree for entire screen
 */
export async function describeAll(udid: string): Promise<string> {
  logger.debug('IDB describe all', { udid });

  const { stdout, stderr, exitCode } = await execFile(
    'idb',
    ['ui', 'describe-all', '--udid', udid],
    { timeout: 15000 }
  );

  if (exitCode !== 0) {
    throw new Error(
      `Failed to get accessibility tree for simulator ${udid}: ${stderr}. ` +
      'Ensure the simulator is booted with an app running.'
    );
  }

  logger.info('UI described', { udid, outputLength: stdout.length });
  return stdout;
}

/**
 * Get accessibility information at a specific point
 */
export async function describePoint(udid: string, x: number, y: number): Promise<string> {
  logger.debug('IDB describe point', { udid, x, y });

  const { stdout, stderr, exitCode } = await execFile(
    'idb',
    ['ui', 'describe-point', '--udid', udid, String(x), String(y)],
    { timeout: 10000 }
  );

  if (exitCode !== 0) {
    throw new Error(
      `Failed to describe point (${String(x)}, ${String(y)}) on simulator ${udid}: ${stderr}. ` +
      'Ensure the simulator is booted with an app running.'
    );
  }

  logger.info('Point described', { udid, x, y });
  return stdout;
}

/**
 * Take a screenshot and save to file
 */
export async function screenshot(udid: string): Promise<ScreenshotResult> {
  logger.debug('IDB screenshot', { udid });

  // Create temp file for screenshot
  const tempDir = mkdtempSync(join(tmpdir(), 'mcp-screenshot-'));
  const tempPath = join(tempDir, 'screenshot.png');

  try {
    const { exitCode, stderr } = await execFile(
      'idb',
      ['screenshot', '--udid', udid, tempPath],
      { timeout: 15000 }
    );

    if (exitCode !== 0) {
      throw new Error(
        `Failed to take screenshot on simulator ${udid}: ${stderr}. ` +
        'Ensure the simulator is booted.'
      );
    }

    // Read screenshot and encode as base64
    const imageBuffer = readFileSync(tempPath);
    const imageData = imageBuffer.toString('base64');

    logger.info('Screenshot captured', {
      udid,
      tempPath,
      sizeBytes: imageBuffer.length
    });

    return {
      path: tempPath,
      imageData,
      format: 'png'
    };
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
      logger.debug('Cleaned up screenshot temp directory', { tempDir });
    } catch (error) {
      logger.warn('Failed to cleanup screenshot temp directory', {
        tempDir,
        error: String(error)
      });
    }
  }
}
