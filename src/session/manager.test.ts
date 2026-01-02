import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock the simulator functions
const mockCreateSimulator = jest.fn<() => Promise<string>>();
const mockBootSimulator = jest.fn<() => Promise<void>>();
const mockShutdownSimulator = jest.fn<() => Promise<void>>();
const mockDeleteSimulator = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../simulator/simctl.js', () => ({
  createSimulator: mockCreateSimulator,
  bootSimulator: mockBootSimulator,
  shutdownSimulator: mockShutdownSimulator,
  deleteSimulator: mockDeleteSimulator,
}));

const { SessionManager } = await import('./manager.js');

describe('SessionManager Security', () => {
  let testDir: string;
  let validFlutterProject: string;
  let sessionManager: InstanceType<typeof SessionManager>;

  beforeEach(() => {
    // Create temp directory for testing
    testDir = join(tmpdir(), `mcp-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create a valid Flutter project structure
    validFlutterProject = join(testDir, 'valid-flutter-project');
    mkdirSync(validFlutterProject, { recursive: true });
    writeFileSync(join(validFlutterProject, 'pubspec.yaml'), 'name: test_app\n');

    // Reset mocks
    mockCreateSimulator.mockClear();
    mockBootSimulator.mockClear();
    mockShutdownSimulator.mockClear();
    mockDeleteSimulator.mockClear();

    // Mock successful simulator operations
    mockCreateSimulator.mockResolvedValue('TEST-UDID-123');
    mockBootSimulator.mockResolvedValue(undefined);
    mockShutdownSimulator.mockResolvedValue(undefined);
    mockDeleteSimulator.mockResolvedValue(undefined);

    // Create session manager with test directory as allowed path
    sessionManager = new SessionManager(testDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Path Traversal Protection', () => {
    it('should reject paths outside allowed prefix', async () => {
      await expect(
        sessionManager.createSession({
          worktreePath: '/etc',
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Access denied.*must be under/);
    });

    it('should reject path traversal attempts with ../', async () => {
      await expect(
        sessionManager.createSession({
          worktreePath: `${testDir}/../../../etc`,
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Access denied.*must be under/);
    });

    it('should reject system directories', async () => {
      const systemDirs = ['/usr', '/bin', '/sbin', '/var', '/System'];

      for (const dir of systemDirs) {
        const manager = new SessionManager('/Users/');
        await expect(
          manager.createSession({
            worktreePath: dir,
            deviceType: 'iPhone 16 Pro',
          })
        ).rejects.toThrow(/Access denied/);
      }
    });

    it('should allow valid paths within allowed prefix', async () => {
      const result = await sessionManager.createSession({
        worktreePath: validFlutterProject,
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(validFlutterProject);
      expect(result.simulatorUdid).toBe('TEST-UDID-123');
      expect(mockCreateSimulator).toHaveBeenCalled();
      expect(mockBootSimulator).toHaveBeenCalledWith('TEST-UDID-123');
    });
  });

  describe('Flutter Project Validation', () => {
    it('should reject directories without pubspec.yaml', async () => {
      const invalidProject = join(testDir, 'invalid-project');
      mkdirSync(invalidProject, { recursive: true });

      await expect(
        sessionManager.createSession({
          worktreePath: invalidProject,
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Not a valid Flutter project.*missing pubspec.yaml/);
    });

    it('should reject non-existent paths', async () => {
      await expect(
        sessionManager.createSession({
          worktreePath: join(testDir, 'does-not-exist'),
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/directory does not exist/);
    });

    it('should reject file paths (not directories)', async () => {
      const filePath = join(testDir, 'somefile.txt');
      writeFileSync(filePath, 'content');

      await expect(
        sessionManager.createSession({
          worktreePath: filePath,
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/not a directory/);
    });

    it('should accept valid Flutter projects', async () => {
      const result = await sessionManager.createSession({
        worktreePath: validFlutterProject,
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.id).toBeDefined();
      expect(result.worktreePath).toBe(validFlutterProject);
    });
  });

  describe('configure() method', () => {
    it('should update allowed path prefix', () => {
      const newManager = new SessionManager('/Users/');
      newManager.configure('/tmp/');

      // Should now accept /tmp paths
      const tmpProject = join('/tmp', 'test-project');
      mkdirSync(tmpProject, { recursive: true });
      writeFileSync(join(tmpProject, 'pubspec.yaml'), 'name: test\n');

      return expect(
        newManager.createSession({
          worktreePath: tmpProject,
          deviceType: 'iPhone 16 Pro',
        })
      ).resolves.toBeDefined();
    });
  });
});
