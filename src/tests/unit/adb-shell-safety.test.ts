import test from "node:test";
import assert from "node:assert/strict";

import { assertSafeAdbShellCommand } from "../../adb/shell-safety.js";

test("allows safe shell command", () => {
  assert.doesNotThrow(() => {
    assertSafeAdbShellCommand("pm list packages");
  });
});

test("blocks reboot command", () => {
  assert.throws(() => {
    assertSafeAdbShellCommand("reboot");
  }, /safe mode/);
});

test("blocks rm -rf root command", () => {
  assert.throws(() => {
    assertSafeAdbShellCommand("rm -rf /");
  }, /safe mode/);
});
