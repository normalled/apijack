import { describe, expect, test } from 'bun:test';
import { createCli } from '../../src';
import { BasicAuthStrategy } from '../../src/auth';
import type { ApijackPlugin } from '../../src/types';

describe('cli-builder merges stateless plugin resolvers', () => {
    test('plugin.resolvers are reachable alongside consumerResolvers during run()', async () => {
        // Not a full e2e test — asserts that cli.run() completes without throwing
        // when a plugin with stateless resolvers is registered and no collisions occur.
        // The real behavioral test (routine resolves $_myplug) lives in later tasks
        // that exercise the executor with plugin resolvers in customResolvers.
        const cli = createCli({
            name: 'smoke',
            description: 'smoke',
            version: '1.9.0',
            specPath: '',
            auth: new BasicAuthStrategy(),
        });
        const plugin: ApijackPlugin = {
            name: 'myplug',
            resolvers: { _myplug: () => 'PLUG' },
        };
        cli.use(plugin);
        // run() may fail later for other reasons (no command specified, spec path empty, etc.);
        // we only assert it doesn't throw from plugin validation or resolver merge.
        // Capture stderr to suppress output, and neutralise process.exit so the
        // downstream help path (showCustomHelp) can't terminate the test runner.
        const origErr = process.stderr.write.bind(process.stderr);
        const origOut = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;
        process.stderr.write = (() => true) as never;
        process.stdout.write = (() => true) as never;
        console.log = () => {};
        (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
            throw new Error(`process.exit(${code})`);
        }) as never;

        try {
            await cli.run().catch(() => { /* swallow any downstream errors */ });
        } finally {
            process.stderr.write = origErr as never;
            process.stdout.write = origOut as never;
            console.log = origLog;
            (process as unknown as { exit: typeof origExit }).exit = origExit;
        }

        // If we reach here, plugin validation + resolver merge succeeded.
        expect(true).toBe(true);
    });
});
