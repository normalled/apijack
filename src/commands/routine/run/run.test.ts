import { describe, test, expect, mock } from "bun:test";
import { routineRunAction } from "./run";

describe("routineRunAction", () => {
  test("executes routine and returns result", async () => {
    const result = await routineRunAction({
      loadRoutine: () => ({ name: "test-routine", description: "A test", steps: [] }),
      validateRoutine: () => [],
      executeRoutine: mock(() => Promise.resolve({ success: true, stepsRun: 2, stepsSkipped: 0, stepsFailed: 0 })),
      dispatch: mock(() => Promise.resolve({})),
      overrides: {},
      invalidateSession: mock(() => {}),
    });
    expect(result.success).toBe(true);
    expect(result.stepsRun).toBe(2);
  });

  test("throws on validation errors", () => {
    expect(routineRunAction({
      loadRoutine: () => ({ name: "bad", steps: [] }),
      validateRoutine: () => ["missing steps"],
      executeRoutine: mock(() => Promise.resolve({ success: true, stepsRun: 0, stepsSkipped: 0, stepsFailed: 0 })),
      dispatch: mock(() => Promise.resolve({})),
      overrides: {},
      invalidateSession: mock(() => {}),
    })).rejects.toThrow("Validation errors");
  });
});
