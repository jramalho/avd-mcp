import test from "node:test";
import assert from "node:assert/strict";

import { AdbRunner } from "../../adb/runner.js";

test("runAdbCommand adds serial prefix when serial is provided", async () => {
  let capturedArgs: string[] = [];

  const runner = new AdbRunner(async ({ args }) => {
    capturedArgs = args;
    return {
      stdout: "ok",
      stdoutBuffer: Buffer.from("ok"),
      stderr: "",
      exitCode: 0,
    };
  }, 30_000);

  const result = await runner.runAdbCommand({
    serial: "emulator-5554",
    args: ["shell", "getprop", "sys.boot_completed"],
  });

  assert.deepEqual(capturedArgs, ["-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
});

test("runAdbCommand uses default timeout when timeout is not provided", async () => {
  let capturedTimeout = 0;

  const runner = new AdbRunner(async ({ timeoutMs }) => {
    capturedTimeout = timeoutMs;
    return {
      stdout: "",
      stdoutBuffer: Buffer.alloc(0),
      stderr: "",
      exitCode: 0,
    };
  }, 12_345);

  await runner.runAdbCommand({
    args: ["devices"],
  });

  assert.equal(capturedTimeout, 12_345);
});

test("runAdbCommand rejects unsafe arguments", async () => {
  const runner = new AdbRunner(async () => ({
    stdout: "",
    stdoutBuffer: Buffer.alloc(0),
    stderr: "",
    exitCode: 0,
  }));

  await assert.rejects(
    () =>
      runner.runAdbCommand({
        args: ["shell", "pm;reboot"],
      }),
    /Argumento inseguro/
  );
});

test("runAdbCommand returns structured output with duration", async () => {
  const runner = new AdbRunner(async () => ({
    stdout: "line1",
    stdoutBuffer: Buffer.from("line1"),
    stderr: "warn",
    exitCode: 42,
  }));

  const result = await runner.runAdbCommand({
    args: ["devices"],
  });

  assert.equal(result.stdout, "line1");
  assert.equal(result.stderr, "warn");
  assert.equal(result.exitCode, 42);
  assert.equal(typeof result.durationMs, "number");
  assert.equal(result.durationMs >= 0, true);
});
