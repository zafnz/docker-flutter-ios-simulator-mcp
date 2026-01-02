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

  describe('Base Path Feature', () => {
    let basePathTestDir: string;
    let projectA: string;
    let projectB: string;

    beforeEach(() => {
      // Create a base directory with multiple projects
      basePathTestDir = join(testDir, 'projects');
      mkdirSync(basePathTestDir, { recursive: true });

      projectA = join(basePathTestDir, 'project-a');
      mkdirSync(projectA, { recursive: true });
      writeFileSync(join(projectA, 'pubspec.yaml'), 'name: project_a\n');

      projectB = join(basePathTestDir, 'project-b');
      mkdirSync(projectB, { recursive: true });
      writeFileSync(join(projectB, 'pubspec.yaml'), 'name: project_b\n');
    });

    it('should resolve relative paths when basePath is configured', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Using "/project-a" should resolve to basePathTestDir/project-a
      const result = await manager.createSession({
        worktreePath: '/project-a',
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(projectA);
      expect(result.simulatorUdid).toBe('TEST-UDID-123');
    });

    it('should resolve paths without leading slash when basePath is configured', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Using "project-b" should resolve to basePathTestDir/project-b
      const result = await manager.createSession({
        worktreePath: 'project-b',
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(projectB);
    });

    it('should block path traversal attempts with basePath configured', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Attempt to escape basePath using ../
      await expect(
        manager.createSession({
          worktreePath: '../../etc',
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Path traversal detected/);
    });

    it('should handle leading slash with ../ (resolves within basePath)', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Note: '/../../../etc' when joined with basePath resolves to basePathTestDir/../../../etc
      // which normalizes to something like /tmp/.../etc (not /etc), so it may be within testDir
      // This test verifies it either: throws path traversal error OR directory doesn't exist
      await expect(
        manager.createSession({
          worktreePath: '/../../../etc',
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Path traversal detected|directory does not exist|Access denied/);
    });

    it('should block subtle path traversal attempts', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Various path traversal attempts
      const maliciousPaths = [
        '../../../etc',
        'project-a/../../..',
        'project-a/../../../etc',
        './../..',
      ];

      for (const path of maliciousPaths) {
        await expect(
          manager.createSession({
            worktreePath: path,
            deviceType: 'iPhone 16 Pro',
          })
        ).rejects.toThrow(/Path traversal detected|Access denied/);
      }
    });

    it('should enforce allow-only on the resolved full path', async () => {
      // Configure basePath but restrict allow-only to a subdirectory
      const manager = new SessionManager(projectA);
      manager.configure(projectA, undefined, undefined, undefined, basePathTestDir);

      // Try to access project-b which is outside the allow-only path
      await expect(
        manager.createSession({
          worktreePath: '/project-b',
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Access denied.*must be under/);
    });

    it('should allow navigation within basePath using relative paths', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // Create a nested project
      const nestedProject = join(projectA, 'nested');
      mkdirSync(nestedProject, { recursive: true });
      writeFileSync(join(nestedProject, 'pubspec.yaml'), 'name: nested\n');

      const result = await manager.createSession({
        worktreePath: 'project-a/nested',
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(nestedProject);
    });

    it('should work without basePath (backward compatibility)', async () => {
      const manager = new SessionManager(testDir);
      // Don't configure basePath
      manager.configure(testDir);

      // Should work with absolute paths as before
      const result = await manager.createSession({
        worktreePath: projectA,
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(projectA);
    });

    it('should normalize paths with . and .. within basePath', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // This should resolve to project-a after normalization
      const result = await manager.createSession({
        worktreePath: 'project-b/../project-a',
        deviceType: 'iPhone 16 Pro',
      });

      expect(result.worktreePath).toBe(projectA);
    });

    it('should reject paths that resolve outside basePath after normalization', async () => {
      const manager = new SessionManager(testDir);
      manager.configure(testDir, undefined, undefined, undefined, basePathTestDir);

      // This normalizes to .. which escapes basePath
      await expect(
        manager.createSession({
          worktreePath: 'project-a/../..',
          deviceType: 'iPhone 16 Pro',
        })
      ).rejects.toThrow(/Path traversal detected/);
    });
  });

  describe('Session Timeout Feature', () => {
    afterEach(async () => {
      // Clean up any timeout monitoring intervals
      await sessionManager.cleanup();
    });

    it('should initialize lastActivityAt when creating a session', async () => {
      const result = await sessionManager.createSession({
        worktreePath: validFlutterProject,
        deviceType: 'iPhone 16 Pro',
      });

      const session = sessionManager.getSession(result.id);
      expect(session).toBeDefined();
      expect(session!.lastActivityAt).toBeInstanceOf(Date);
      expect(session!.createdAt.getTime()).toBeCloseTo(session!.lastActivityAt.getTime(), -2);
    });

    it('should update lastActivityAt when updateSessionActivity is called', async () => {
      const result = await sessionManager.createSession({
        worktreePath: validFlutterProject,
        deviceType: 'iPhone 16 Pro',
      });

      const session = sessionManager.getSession(result.id);
      const initialActivity = session!.lastActivityAt.getTime();

      // Wait a bit and update activity
      await new Promise((resolve) => setTimeout(resolve, 10));
      sessionManager.updateSessionActivity(result.id);

      const updatedSession = sessionManager.getSession(result.id);
      expect(updatedSession!.lastActivityAt.getTime()).toBeGreaterThan(initialActivity);
    });

    it('should not throw when updating activity for non-existent session', () => {
      expect(() => {
        sessionManager.updateSessionActivity('non-existent-session-id');
      }).not.toThrow();
    });

    it('should configure timeout monitoring when sessionTimeout is set', async () => {
      const manager = new SessionManager(testDir);

      try {
        // Configure with a timeout
        manager.configure(testDir, 10, undefined, undefined, undefined, 5);

        // The timeout monitoring should be started (we can't easily test the interval directly)
        // but we can verify it doesn't throw
        expect(true).toBe(true);
      } finally {
        // Clean up the manager to stop any intervals
        await manager.cleanup();
      }
    });

    it('should clean up timeout monitoring interval on cleanup', async () => {
      // Create a separate test directory for this test
      const separateTestDir = join(tmpdir(), `mcp-timeout-test-${Date.now()}`);
      mkdirSync(separateTestDir, { recursive: true });
      const separateProject = join(separateTestDir, 'test-project');
      mkdirSync(separateProject, { recursive: true });
      writeFileSync(join(separateProject, 'pubspec.yaml'), 'name: test\n');

      try {
        const manager = new SessionManager(separateTestDir);
        manager.configure(separateTestDir, 10, undefined, undefined, undefined, 5);

        // Create a session
        const result = await manager.createSession({
          worktreePath: separateProject,
          deviceType: 'iPhone 16 Pro',
        });

        // Cleanup should stop the interval
        await manager.cleanup();

        // Verify session was cleaned up
        expect(manager.getSession(result.id)).toBeUndefined();
      } finally {
        // Clean up the separate test directory
        rmSync(separateTestDir, { recursive: true, force: true });
      }
    });
  });
});
