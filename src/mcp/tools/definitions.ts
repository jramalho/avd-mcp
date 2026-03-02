import { z } from "zod";

import { gpuModes } from "../../domain/avd.js";

export const runAndScreenshotInputSchema = {
  type: "object",
  properties: {
    avdName: { type: "string" },
    serial: { type: "string" },
    command: { type: "string" },
    coldBoot: { type: "boolean", default: false },
    wipeData: { type: "boolean", default: false },
    noWindow: { type: "boolean", default: false },
    readOnly: { type: "boolean", default: false },
    gpuMode: {
      type: "string",
      enum: [...gpuModes],
    },
    waitMsAfterRun: { type: "number", default: 2000 },
  },
  required: ["command"],
} as const;

export const runAndScreenshotSchema = z.object({
  avdName: z.string().optional(),
  serial: z.string().optional(),
  command: z.string(),
  coldBoot: z.boolean().optional().default(false),
  wipeData: z.boolean().optional().default(false),
  noWindow: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  gpuMode: z.enum(gpuModes).optional(),
  waitMsAfterRun: z.number().optional().default(2000),
});

export const startAvdInputSchema = {
  type: "object",
  properties: {
    avdName: { type: "string" },
    coldBoot: { type: "boolean", default: false },
    wipeData: { type: "boolean", default: false },
    noWindow: { type: "boolean", default: false },
    readOnly: { type: "boolean", default: false },
    gpuMode: {
      type: "string",
      enum: [...gpuModes],
    },
    waitForBoot: { type: "boolean", default: true },
  },
  required: [],
} as const;

export const startAvdSchema = z.object({
  avdName: z.string().optional(),
  coldBoot: z.boolean().optional().default(false),
  wipeData: z.boolean().optional().default(false),
  noWindow: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  gpuMode: z.enum(gpuModes).optional(),
  waitForBoot: z.boolean().optional().default(true),
});

export const stopAvdInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
  },
  required: [],
} as const;

export const stopAvdSchema = z.object({
  serial: z.string().optional(),
});

export const avdStatusInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
  },
  required: [],
} as const;

export const avdStatusSchema = z.object({
  serial: z.string().optional(),
});

export const avdRestartInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    coldBoot: { type: "boolean", default: false },
    wipeData: { type: "boolean", default: false },
    noWindow: { type: "boolean", default: false },
    readOnly: { type: "boolean", default: false },
    gpuMode: {
      type: "string",
      enum: [...gpuModes],
    },
    waitForBoot: { type: "boolean", default: true },
  },
  required: [],
} as const;

export const avdRestartSchema = z.object({
  serial: z.string().optional(),
  coldBoot: z.boolean().optional().default(false),
  wipeData: z.boolean().optional().default(false),
  noWindow: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  gpuMode: z.enum(gpuModes).optional(),
  waitForBoot: z.boolean().optional().default(true),
});

export const adbInstallApkInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    apkPath: { type: "string" },
    timeoutMs: { type: "number", default: 120000 },
  },
  required: ["apkPath"],
} as const;

export const adbInstallApkSchema = z.object({
  serial: z.string().optional(),
  apkPath: z.string().min(1),
  timeoutMs: z.number().optional().default(120_000),
});

export const adbUninstallInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    packageName: { type: "string" },
    timeoutMs: { type: "number", default: 60000 },
  },
  required: ["packageName"],
} as const;

export const adbUninstallSchema = z.object({
  serial: z.string().optional(),
  packageName: z.string().min(1),
  timeoutMs: z.number().optional().default(60_000),
});

export const adbShellInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    command: { type: "string" },
    timeoutMs: { type: "number", default: 30000 },
  },
  required: ["command"],
} as const;

export const adbShellSchema = z.object({
  serial: z.string().optional(),
  command: z.string().min(1),
  timeoutMs: z.number().optional().default(30_000),
});

export const adbLogcatInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    filter: { type: "string" },
    maxLines: { type: "number", default: 200 },
    timeoutMs: { type: "number", default: 5000 },
  },
  required: [],
} as const;

export const adbLogcatSchema = z.object({
  serial: z.string().optional(),
  filter: z.string().optional(),
  maxLines: z.number().optional().default(200),
  timeoutMs: z.number().optional().default(5_000),
});

export const appLaunchInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    packageName: { type: "string" },
    activity: { type: "string" },
    timeoutMs: { type: "number", default: 30000 },
  },
  required: ["packageName"],
} as const;

export const appLaunchSchema = z.object({
  serial: z.string().optional(),
  packageName: z.string().min(1),
  activity: z.string().optional(),
  timeoutMs: z.number().optional().default(30_000),
});

export const appForceStopInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    packageName: { type: "string" },
    timeoutMs: { type: "number", default: 30000 },
  },
  required: ["packageName"],
} as const;

export const appForceStopSchema = z.object({
  serial: z.string().optional(),
  packageName: z.string().min(1),
  timeoutMs: z.number().optional().default(30_000),
});

export const openDeeplinkInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    uri: { type: "string" },
    packageName: { type: "string" },
    timeoutMs: { type: "number", default: 30000 },
  },
  required: ["uri"],
} as const;

export const openDeeplinkSchema = z.object({
  serial: z.string().optional(),
  uri: z.string().min(1),
  packageName: z.string().optional(),
  timeoutMs: z.number().optional().default(30_000),
});

export const grantPermissionsInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    packageName: { type: "string" },
    permissions: {
      type: "array",
      items: { type: "string" },
    },
    timeoutMsPerPermission: { type: "number", default: 15000 },
  },
  required: ["packageName", "permissions"],
} as const;

export const grantPermissionsSchema = z.object({
  serial: z.string().optional(),
  packageName: z.string().min(1),
  permissions: z.array(z.string().min(1)).min(1),
  timeoutMsPerPermission: z.number().optional().default(15_000),
});

export const clearAppDataInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    packageName: { type: "string" },
    timeoutMs: { type: "number", default: 30000 },
  },
  required: ["packageName"],
} as const;

export const clearAppDataSchema = z.object({
  serial: z.string().optional(),
  packageName: z.string().min(1),
  timeoutMs: z.number().optional().default(30_000),
});

export const toolDefinitions = [
  {
    name: "avd_run_and_screenshot",
    description:
      "Sobe AVD se necessário, roda comando (pnpm/gradle/etc) e tira screenshot.",
    inputSchema: runAndScreenshotInputSchema,
  },
  {
    name: "avd_list",
    description: "Lista os AVDs disponíveis na máquina via emulator -list-avds.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "avd_start",
    description: "Sobe um AVD com opções de boot (coldBoot, wipeData, noWindow, readOnly, gpuMode).",
    inputSchema: startAvdInputSchema,
  },
  {
    name: "avd_stop",
    description: "Encerra um emulador online via adb emu kill (serial opcional).",
    inputSchema: stopAvdInputSchema,
  },
  {
    name: "avd_status",
    description: "Retorna status dos devices adb (state, boot_completed e metadados de emulador).",
    inputSchema: avdStatusInputSchema,
  },
  {
    name: "avd_restart",
    description: "Reinicia um emulador (kill + start) com opções de boot e telemetria de duração.",
    inputSchema: avdRestartInputSchema,
  },
  {
    name: "adb_install_apk",
    description: "Instala APK no device via adb install -r.",
    inputSchema: adbInstallApkInputSchema,
  },
  {
    name: "adb_uninstall",
    description: "Remove pacote Android via adb uninstall.",
    inputSchema: adbUninstallInputSchema,
  },
  {
    name: "adb_shell",
    description: "Executa comando adb shell em safe mode.",
    inputSchema: adbShellInputSchema,
  },
  {
    name: "adb_logcat",
    description: "Lê logcat com timeout curto e limite de linhas.",
    inputSchema: adbLogcatInputSchema,
  },
  {
    name: "app_launch",
    description: "Abre o app por monkey ou am start quando activity for informada.",
    inputSchema: appLaunchInputSchema,
  },
  {
    name: "app_force_stop",
    description: "Força parada do app via am force-stop.",
    inputSchema: appForceStopInputSchema,
  },
  {
    name: "open_deeplink",
    description: "Abre deeplink via am start VIEW com URI.",
    inputSchema: openDeeplinkInputSchema,
  },
  {
    name: "grant_permissions",
    description: "Concede permissões com pm grant e retorno por permissão.",
    inputSchema: grantPermissionsInputSchema,
  },
  {
    name: "clear_app_data",
    description: "Limpa dados do app alvo com pm clear em safe mode.",
    inputSchema: clearAppDataInputSchema,
  },
] as const;
