export interface ScreenshotPort {
  capturePng(serial?: string): Promise<Buffer>;
}
