export type AdbDevice = {
  serial: string;
  state: string;
};

export interface AdbPort {
  listDevices(): Promise<AdbDevice[]>;
  hasOnlineDevice(): Promise<boolean>;
  listOnlineDeviceSerials(): Promise<string[]>;
  getBootCompleted(serial: string): Promise<boolean>;
  getEmulatorAvdName(serial: string): Promise<string | undefined>;
  killEmulator(serial: string): Promise<void>;
}
