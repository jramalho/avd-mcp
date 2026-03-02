import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CommandRunnerPort } from "../../ports/command-runner-port.js";

const exec = promisify(execFile);

export class ExecCommandRunner implements CommandRunnerPort {
  async run(command: string, args: string[], timeout: number) {
    const { stdout, stderr } = await exec(command, args, {
      timeout,
      maxBuffer: 50 * 1024 * 1024,
    });

    return {
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
    };
  }
}
