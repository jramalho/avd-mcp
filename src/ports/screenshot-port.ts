export interface ScreenshotPort {
  capturePng(): Promise<Buffer>;
}
