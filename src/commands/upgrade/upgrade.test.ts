import { describe, test, expect, mock } from "bun:test";
import { upgradeAction } from "./upgrade";

describe("upgradeAction", () => {
  test("returns null when already on latest", async () => {
    const result = await upgradeAction({
      currentVersion: "1.2.0",
      checkLatest: async () => "1.2.0",
      install: mock(() => Promise.resolve(0)),
    });
    expect(result).toBeNull();
  });

  test("returns versions when upgrade available and install succeeds", async () => {
    const installFn = mock(() => Promise.resolve(0));
    const result = await upgradeAction({
      currentVersion: "1.2.0",
      checkLatest: async () => "1.3.0",
      install: installFn,
    });
    expect(result).toEqual({ previousVersion: "1.2.0", newVersion: "1.3.0" });
    expect(installFn).toHaveBeenCalledWith("1.3.0");
  });

  test("throws when install fails", () => {
    expect(upgradeAction({
      currentVersion: "1.2.0",
      checkLatest: async () => "1.3.0",
      install: mock(() => Promise.resolve(1)),
    })).rejects.toThrow("Upgrade failed");
  });

  test("throws when registry check fails", () => {
    expect(upgradeAction({
      currentVersion: "1.2.0",
      checkLatest: async () => { throw new Error("network"); },
      install: mock(() => Promise.resolve(0)),
    })).rejects.toThrow("network");
  });
});
