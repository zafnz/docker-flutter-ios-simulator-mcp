import { execFile } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { DeviceType, SimctlListOutput } from './types.js';

export async function listDeviceTypes(): Promise<DeviceType[]> {
  logger.debug('Listing device types');

  const result = await execFile('xcrun', ['simctl', 'list', 'devicetypes', '-j']);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list device types: ${result.stderr}`);
  }

  const output = JSON.parse(result.stdout) as SimctlListOutput;
  const deviceTypes = output.devicetypes || [];

  const iPhoneTypes = deviceTypes.filter((dt) =>
    dt.name.toLowerCase().includes('iphone')
  );

  logger.debug('Found device types', { count: iPhoneTypes.length });
  return iPhoneTypes;
}

export async function getDeviceTypeIdentifier(deviceName: string): Promise<string> {
  const deviceTypes = await listDeviceTypes();

  const match = deviceTypes.find((dt) =>
    dt.name.toLowerCase().includes(deviceName.toLowerCase())
  );

  if (!match) {
    const availableNames = deviceTypes.map((dt) => dt.name).join(', ');
    throw new Error(
      `Device type not found: ${deviceName}. Available: ${availableNames}`
    );
  }

  return match.identifier;
}

export async function createSimulator(deviceType: string): Promise<string> {
  logger.info('Creating simulator', { deviceType });

  const deviceTypeId = await getDeviceTypeIdentifier(deviceType);

  const simulatorName = `MCP-${String(Date.now())}`;

  const result = await execFile(
    'xcrun',
    ['simctl', 'create', simulatorName, deviceTypeId],
    { timeout: 30000 }
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create simulator "${simulatorName}" with device type "${deviceType}": ${result.stderr}. ` +
      'This may indicate insufficient disk space or Xcode/CoreSimulator issues. ' +
      'Try running "xcrun simctl list devicetypes" to verify available device types.'
    );
  }

  const udid = result.stdout.trim();
  logger.info('Simulator created', { udid, name: simulatorName });

  return udid;
}

export async function bootSimulator(udid: string): Promise<void> {
  logger.info('Booting simulator', { udid });

  const result = await execFile('xcrun', ['simctl', 'boot', udid], { timeout: 60000 });

  if (result.exitCode !== 0 && !result.stderr.includes('Unable to boot device in current state: Booted')) {
    throw new Error(
      `Failed to boot simulator (UDID: ${udid}): ${result.stderr}. ` +
      'This may indicate the simulator is in an invalid state or Xcode/CoreSimulator is not running properly. ' +
      'Try running "xcrun simctl list" to check simulator status.'
    );
  }

  logger.info('Simulator booted', { udid });
}

export async function shutdownSimulator(udid: string): Promise<void> {
  logger.info('Shutting down simulator', { udid });

  const result = await execFile('xcrun', ['simctl', 'shutdown', udid]);

  if (result.exitCode !== 0 && !result.stderr.includes('Unable to shutdown device in current state: Shutdown')) {
    logger.warn('Failed to shutdown simulator', {
      udid,
      stderr: result.stderr,
    });
  }

  logger.info('Simulator shutdown', { udid });
}

export async function deleteSimulator(udid: string): Promise<void> {
  logger.info('Deleting simulator', { udid });

  const result = await execFile('xcrun', ['simctl', 'delete', udid]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to delete simulator: ${result.stderr}`);
  }

  logger.info('Simulator deleted', { udid });
}

export async function getSimulatorStatus(udid: string): Promise<string> {
  const result = await execFile('xcrun', ['simctl', 'list', 'devices', '-j']);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list devices: ${result.stderr}`);
  }

  const output = JSON.parse(result.stdout) as SimctlListOutput;
  const devices = output.devices || {};

  for (const runtime of Object.keys(devices)) {
    const device = devices[runtime].find((d) => d.udid === udid);
    if (device) {
      return device.state;
    }
  }

  throw new Error(`Simulator not found: ${udid}`);
}
