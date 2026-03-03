export type MediaConfig = {
  inlineBase64ByDefault: boolean;
  artifactsRootDir: string;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getMediaConfig(): MediaConfig {
  return {
    inlineBase64ByDefault: parseBoolean(process.env.MCP_INLINE_BASE64, false),
    artifactsRootDir: process.env.MCP_ARTIFACTS_DIR ?? ".artifacts",
  };
}
