export type CommandResult = {
  stdout: string;
  stderr: string;
};

export interface CommandRunnerPort {
  run(command: string, args: string[], timeout: number): Promise<CommandResult>;
}
