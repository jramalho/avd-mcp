export interface AdbPort {
  hasOnlineDevice(): Promise<boolean>;
  listOnlineDeviceSerials(): Promise<string[]>;
  killEmulator(serial: string): Promise<void>;
}
