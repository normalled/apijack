import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { loadPreRequestHook, type PreRequestHookConfig } from "../src/pre-request";

// Each test uses a unique directory to avoid Bun's module cache
// returning stale imports for the same file path.
const baseDir = join(import.meta.dir, ".tmp-pre-request");
let testCounter = 0;

function createTestDir(): string {
    const dir = join(baseDir, `test-${++testCounter}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
});

describe("loadPreRequestHook", () => {
    test("returns null when no hook file exists", async () => {
        const tmpDir = createTestDir();
        const result = await loadPreRequestHook(tmpDir);
        expect(result).toBeNull();
    });

    test("loads .ts hook with default export function", async () => {
        const tmpDir = createTestDir();
        writeFileSync(join(tmpDir, "pre-request.ts"), `
            export default function handler(req: { method: string; url: string }) {
                // noop
            }
        `);
        const result = await loadPreRequestHook(tmpDir);
        expect(result).not.toBeNull();
        expect(typeof result!.handler).toBe("function");
        expect(result!.beforeDryRun).toBe(false);
    });

    test("loads .js hook as fallback when .ts does not exist", async () => {
        const tmpDir = createTestDir();
        writeFileSync(join(tmpDir, "pre-request.js"), `
            export default function handler(req) {}
        `);
        const result = await loadPreRequestHook(tmpDir);
        expect(result).not.toBeNull();
        expect(typeof result!.handler).toBe("function");
    });

    test("reads beforeDryRun named export", async () => {
        const tmpDir = createTestDir();
        writeFileSync(join(tmpDir, "pre-request.ts"), `
            export default function handler(req: { method: string; url: string }) {}
            export const beforeDryRun = true;
        `);
        const result = await loadPreRequestHook(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.beforeDryRun).toBe(true);
    });

    test("returns null if default export is not a function", async () => {
        const tmpDir = createTestDir();
        writeFileSync(join(tmpDir, "pre-request.ts"), `
            export default "not a function";
        `);
        const result = await loadPreRequestHook(tmpDir);
        expect(result).toBeNull();
    });
});
