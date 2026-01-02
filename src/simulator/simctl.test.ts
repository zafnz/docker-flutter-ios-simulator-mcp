import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ExecResult } from '../utils/exec.js';

const mockExecFile = jest.fn<() => Promise<ExecResult>>();

jest.unstable_mockModule('../utils/exec.js', () => ({
  execFile: mockExecFile,
}));

const {
  listDeviceTypes,
  getDeviceTypeIdentifier,
  createSimulator,
  bootSimulator,
  shutdownSimulator,
  deleteSimulator,
  getSimulatorStatus,
} = await import('./simctl.js');

describe('simctl', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
  });

  describe('listDeviceTypes', () => {
    it('should list iPhone device types', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          devicetypes: [
            { name: 'iPhone 16 Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro' },
            { name: 'iPhone 15', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15' },
            { name: 'iPad Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });

      const types = await listDeviceTypes();

      expect(types).toHaveLength(2);
      expect(types[0].name).toBe('iPhone 16 Pro');
      expect(types[1].name).toBe('iPhone 15');
    });

    it('should throw error on failure', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: 'command failed',
        exitCode: 1,
      });

      await expect(listDeviceTypes()).rejects.toThrow('Failed to list device types');
    });
  });

  describe('getDeviceTypeIdentifier', () => {
    beforeEach(() => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          devicetypes: [
            { name: 'iPhone 16 Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro' },
            { name: 'iPhone 15', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15' },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });
    });

    it('should find device type by name', async () => {
      const identifier = await getDeviceTypeIdentifier('iPhone 16 Pro');
      expect(identifier).toBe('com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro');
    });

    it('should match case-insensitively', async () => {
      const identifier = await getDeviceTypeIdentifier('iphone 16 pro');
      expect(identifier).toBe('com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro');
    });

    it('should throw error if device type not found', async () => {
      await expect(getDeviceTypeIdentifier('iPhone 99')).rejects.toThrow('Device type not found');
    });
  });

  describe('createSimulator', () => {
    it('should create simulator', async () => {
      mockExecFile
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devicetypes: [
              { name: 'iPhone 16 Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro' },
            ],
          }),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: 'ABCD-1234-EFGH-5678',
          stderr: '',
          exitCode: 0,
        });

      const udid = await createSimulator('iPhone 16 Pro');

      expect(udid).toBe('ABCD-1234-EFGH-5678');
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('bootSimulator', () => {
    it('should boot simulator', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await bootSimulator('TEST-UDID');

      expect(mockExecFile).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'TEST-UDID'],
        expect.any(Object)
      );
    });

    it('should handle already booted simulator', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: 'Unable to boot device in current state: Booted',
        exitCode: 1,
      });

      await expect(bootSimulator('TEST-UDID')).resolves.not.toThrow();
    });
  });

  describe('shutdownSimulator', () => {
    it('should shutdown simulator', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await shutdownSimulator('TEST-UDID');

      expect(mockExecFile).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'shutdown', 'TEST-UDID']
      );
    });

    it('should handle already shutdown simulator', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: 'Unable to shutdown device in current state: Shutdown',
        exitCode: 1,
      });

      await expect(shutdownSimulator('TEST-UDID')).resolves.not.toThrow();
    });
  });

  describe('deleteSimulator', () => {
    it('should delete simulator', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await deleteSimulator('TEST-UDID');

      expect(mockExecFile).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'delete', 'TEST-UDID']
      );
    });

    it('should throw error on failure', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: 'simulator not found',
        exitCode: 1,
      });

      await expect(deleteSimulator('TEST-UDID')).rejects.toThrow('Failed to delete simulator');
    });
  });

  describe('getSimulatorStatus', () => {
    it('should return simulator status', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({
          devices: {
            'iOS 17.0': [
              { udid: 'TEST-UDID', name: 'iPhone 16 Pro', state: 'Booted', deviceTypeIdentifier: 'com.apple.iPhone-16-Pro' },
            ],
          },
        }),
        stderr: '',
        exitCode: 0,
      });

      const status = await getSimulatorStatus('TEST-UDID');
      expect(status).toBe('Booted');
    });

    it('should throw error if simulator not found', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({ devices: {} }),
        stderr: '',
        exitCode: 0,
      });

      await expect(getSimulatorStatus('NONEXISTENT')).rejects.toThrow('Simulator not found');
    });
  });
});
