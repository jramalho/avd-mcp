import type { CommandResult } from "./command-runner-port.js";

export interface ShellPort {
  run(command: string, timeout: number): Promise<CommandResult>;
}
