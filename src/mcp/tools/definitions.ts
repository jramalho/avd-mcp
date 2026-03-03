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

export const screenrecordStartInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    maxDurationSeconds: { type: "number", default: 120 },
    bitRate: { type: "number" },
    size: { type: "string" },
  },
  required: [],
} as const;

export const screenrecordStartSchema = z.object({
  serial: z.string().optional(),
  maxDurationSeconds: z.number().optional().default(120),
  bitRate: z.number().optional(),
  size: z.string().optional(),
});

export const screenrecordStopInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    sessionId: { type: "string" },
    inlineBase64: { type: "boolean" },
  },
  required: ["sessionId"],
} as const;

export const screenrecordStopSchema = z.object({
  serial: z.string().optional(),
  sessionId: z.string().min(1),
  inlineBase64: z.boolean().optional(),
});

export const screenshotInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    crop: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["x", "y", "width", "height"],
    },
    compressQuality: { type: "number" },
    annotate: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
        },
        required: ["text", "x", "y"],
      },
    },
    inlineBase64: { type: "boolean" },
  },
  required: [],
} as const;

export const screenshotSchema = z.object({
  serial: z.string().optional(),
  crop: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  compressQuality: z.number().optional(),
  annotate: z
    .array(
      z.object({
        text: z.string(),
        x: z.number(),
        y: z.number(),
      })
    )
    .optional(),
  inlineBase64: z.boolean().optional(),
});

export const networkToggleInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    wifiEnabled: { type: "boolean" },
    dataEnabled: { type: "boolean" },
    airplaneMode: { type: "boolean" },
  },
  required: ["wifiEnabled"],
} as const;

export const networkToggleSchema = z.object({
  serial: z.string().optional(),
  wifiEnabled: z.boolean(),
  dataEnabled: z.boolean().optional(),
  airplaneMode: z.boolean().optional(),
});

export const networkConditionInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    profile: {
      oneOf: [
        {
          type: "string",
          enum: ["good", "slow_3g", "lte", "offline"],
        },
        {
          type: "object",
          properties: {
            latencyMs: { type: "number" },
            packetLoss: { type: "number" },
            speedKbps: { type: "number" },
          },
        },
      ],
    },
  },
  required: ["profile"],
} as const;

export const networkConditionSchema = z.object({
  serial: z.string().optional(),
  profile: z.union([
    z.enum(["good", "slow_3g", "lte", "offline"]),
    z
      .object({
        latencyMs: z.number().optional(),
        packetLoss: z.number().optional(),
        speedKbps: z.number().optional(),
      })
      .refine(
        (value) =>
          value.latencyMs !== undefined ||
          value.packetLoss !== undefined ||
          value.speedKbps !== undefined,
        "No perfil avançado, informe ao menos latencyMs, packetLoss ou speedKbps."
      ),
  ]),
});

export const setLocationInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
  },
  required: ["latitude", "longitude"],
} as const;

export const setLocationSchema = z.object({
  serial: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
});

export const setBatteryStateInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    level: { type: "number" },
    charging: { type: "boolean" },
  },
  required: [],
} as const;

export const setBatteryStateSchema = z.object({
  serial: z.string().optional(),
  level: z.number().optional(),
  charging: z.boolean().optional(),
});

export const setRotationInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    orientation: {
      type: "string",
      enum: ["portrait", "landscape"],
    },
  },
  required: ["orientation"],
} as const;

export const setRotationSchema = z.object({
  serial: z.string().optional(),
  orientation: z.enum(["portrait", "landscape"]),
});

export const setLocaleInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
    language: { type: "string" },
    country: { type: "string" },
  },
  required: ["language"],
} as const;

export const setLocaleSchema = z.object({
  serial: z.string().optional(),
  language: z.string().min(2),
  country: z.string().min(2).max(2).optional(),
});

export const getMetricsInputSchema = {
  type: "object",
  properties: {},
  required: [],
} as const;

export const getMetricsSchema = z.object({});

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
  {
    name: "screenrecord_start",
    description: "Inicia gravação de tela no device e retorna sessionId.",
    inputSchema: screenrecordStartInputSchema,
  },
  {
    name: "screenrecord_stop",
    description: "Encerra gravação, faz pull do MP4 e retorna artifact local.",
    inputSchema: screenrecordStopInputSchema,
  },
  {
    name: "screenshot",
    description: "Captura screenshot com crop/compress/annotate e salva em artifacts.",
    inputSchema: screenshotInputSchema,
  },
  {
    name: "network_toggle",
    description: "Liga/desliga wifi, dados móveis e modo avião via adb shell svc/settings.",
    inputSchema: networkToggleInputSchema,
  },
  {
    name: "network_condition",
    description: "Aplica perfil de rede no emulador (delay/speed) ou perfil avançado.",
    inputSchema: networkConditionInputSchema,
  },
  {
    name: "set_location",
    description: "Define localização GPS no emulador via adb emu geo fix.",
    inputSchema: setLocationInputSchema,
  },
  {
    name: "set_battery_state",
    description: "Ajusta estado de bateria (nível/carga) via dumpsys battery.",
    inputSchema: setBatteryStateInputSchema,
  },
  {
    name: "set_rotation",
    description: "Define rotação do device (portrait/landscape).",
    inputSchema: setRotationInputSchema,
  },
  {
    name: "set_locale",
    description: "Define locale do device (idioma/país) via setprop e broadcast.",
    inputSchema: setLocaleInputSchema,
  },
  {
    name: "get_metrics",
    description: "Retorna estatísticas de execução por tool desde o start do processo.",
    inputSchema: getMetricsInputSchema,
  },
] as const;
