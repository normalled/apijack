import { describe, test, expect, mock } from "bun:test";
import { routineInitAction } from "./init";

describe("routineInitAction", () => {
  test("copies builtins and returns count", () => {
    const mkdirFn = mock(() => {});
    const copyFn = mock(() => {});
    const result = routineInitAction({
      routinesDir: "/tmp/routines",
      builtinDir: "/tmp/builtins",
      exists: () => true,
      mkdir: mkdirFn,
      copy: copyFn,
      listDir: () => ["setup.yaml", "deploy.yaml", "test.yaml"],
    });
    expect(result.installed).toBe(3);
    expect(mkdirFn).toHaveBeenCalled();
    expect(copyFn).toHaveBeenCalled();
  });

  test("throws when no builtin directory", () => {
    expect(() => routineInitAction({
      routinesDir: "/tmp/routines",
      builtinDir: undefined,
      exists: () => false,
      mkdir: mock(() => {}),
      copy: mock(() => {}),
      listDir: () => [],
    })).toThrow("No built-in routines");
  });
});
