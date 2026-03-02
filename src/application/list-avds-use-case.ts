import type { EmulatorPort } from "../ports/emulator-port.js";

export class ListAvdsUseCase {
  constructor(private readonly emulatorPort: EmulatorPort) {}

  execute() {
    return this.emulatorPort.listAvds();
  }
}
