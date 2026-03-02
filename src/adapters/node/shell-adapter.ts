import type { CommandRunnerPort } from "../../ports/command-runner-port.js";
import type { ShellPort } from "../../ports/shell-port.js";

function isEnoent(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export class ShellAdapter implements ShellPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async run(command: string, timeout: number) {
    if (process.platform === "win32") {
      return this.commandRunner.run(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        timeout
      );
    }

    try {
      return await this.commandRunner.run("sh", ["-lc", command], timeout);
    } catch (shError: unknown) {
      if (!isEnoent(shError)) throw shError;

      try {
        return await this.commandRunner.run("bash", ["-lc", command], timeout);
      } catch (bashError: unknown) {
        if (!isEnoent(bashError)) throw bashError;
        return this.commandRunner.run("zsh", ["-lc", command], timeout);
      }
    }
  }
}
