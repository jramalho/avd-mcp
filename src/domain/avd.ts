export const gpuModes = ["auto", "host", "swiftshader_indirect"] as const;

export type GpuMode = (typeof gpuModes)[number];

export type BootOptions = {
  avdName?: string;
  coldBoot: boolean;
  wipeData: boolean;
  noWindow: boolean;
  readOnly: boolean;
  gpuMode?: GpuMode;
};

export type RunAndScreenshotInput = BootOptions & {
  serial?: string;
  command: string;
  waitMsAfterRun: number;
};

export type RunAndScreenshotOutput = {
  command: string;
  stdout: string;
  stderr: string;
  screenshotPng: Buffer;
};
