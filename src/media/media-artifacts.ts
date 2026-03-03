import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export class MediaArtifacts {
  constructor(private readonly rootDir: string) {}

  getRecordsDir() {
    return join(this.rootDir, "records");
  }

  getScreenshotsDir() {
    return join(this.rootDir, "screenshots");
  }

  async ensureDirs() {
    await mkdir(this.getRecordsDir(), { recursive: true });
    await mkdir(this.getScreenshotsDir(), { recursive: true });
  }
}
