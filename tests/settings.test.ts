import { describe, test, expect, afterEach, beforeEach, spyOn } from 'bun:test';
import { loadProjectSettings } from '../src/settings';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-settings-test-' + Date.now());

describe('loadProjectSettings()', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('returns empty object when settings.json is missing', () => {
        mkdirSync(testRoot, { recursive: true });
        expect(loadProjectSettings(testRoot)).toEqual({});
    });

    test('reads customCommands.defaults.requiresAuth', () => {
        mkdirSync(testRoot, { recursive: true });
        writeFileSync(
            join(testRoot, 'settings.json'),
            JSON.stringify({ customCommands: { defaults: { requiresAuth: true } } }),
        );

        const settings = loadProjectSettings(testRoot);
        expect(settings.customCommands?.defaults?.requiresAuth).toBe(true);
    });

    test('reads auth.refreshOn', () => {
        mkdirSync(testRoot, { recursive: true });
        writeFileSync(
            join(testRoot, 'settings.json'),
            JSON.stringify({ auth: { refreshOn: [401] } }),
        );

        const settings = loadProjectSettings(testRoot);
        expect(settings.auth?.refreshOn).toEqual([401]);
    });

    test('returns empty object on malformed JSON', () => {
        mkdirSync(testRoot, { recursive: true });
        writeFileSync(join(testRoot, 'settings.json'), '{ not json');
        expect(loadProjectSettings(testRoot)).toEqual({});
    });

    describe('validation', () => {
        let warnSpy: ReturnType<typeof spyOn>;

        beforeEach(() => {
            warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        test('strips auth.refreshOn when it is a scalar and warns with the exact message', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ auth: { refreshOn: 401 } }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.auth?.refreshOn).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toBe(
                "[apijack] .apijack/settings.json: 'auth.refreshOn' must be an array of numbers — ignoring",
            );
        });

        test('strips auth.refreshOn when it contains a non-number and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ auth: { refreshOn: [401, 'x'] } }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.auth?.refreshOn).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("'auth.refreshOn'");
            expect(warnSpy.mock.calls[0][0]).toContain('array of numbers');
        });

        test('strips auth when it is not an object and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ auth: 'nope' }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.auth).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("'auth'");
            expect(warnSpy.mock.calls[0][0]).toContain('an object');
        });

        test('strips customCommands.defaults.requiresAuth when not a boolean and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(
                join(testRoot, 'settings.json'),
                JSON.stringify({ customCommands: { defaults: { requiresAuth: 'yes' } } }),
            );

            const settings = loadProjectSettings(testRoot);

            expect(settings.customCommands?.defaults?.requiresAuth).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("'customCommands.defaults.requiresAuth'");
            expect(warnSpy.mock.calls[0][0]).toContain('boolean');
        });

        test('strips customCommands when it is not an object and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ customCommands: 'nope' }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.customCommands).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("'customCommands'");
            expect(warnSpy.mock.calls[0][0]).toContain('an object');
        });

        test('strips customCommands.defaults when it is not an object and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ customCommands: { defaults: 'nope' } }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.customCommands?.defaults).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain("'customCommands.defaults'");
            expect(warnSpy.mock.calls[0][0]).toContain('an object');
        });

        test('reads disableCommands', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ disableCommands: ['mcp'] }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.disableCommands).toEqual(['mcp']);
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('drops unknown disableCommands entries and keeps valid ones', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(
                join(testRoot, 'settings.json'),
                JSON.stringify({ disableCommands: ['mcp', 'upgrade', 'plugin'] }),
            );

            const settings = loadProjectSettings(testRoot);

            expect(settings.disableCommands).toEqual(['mcp', 'plugin']);
            expect(warnSpy).toHaveBeenCalledWith(
                "[apijack] .apijack/settings.json: 'disableCommands[1]' must be one of 'mcp', 'plugin' — ignoring",
            );
        });

        test('strips disableCommands when not an array and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ disableCommands: 'mcp' }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.disableCommands).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith(
                "[apijack] .apijack/settings.json: 'disableCommands' must be an array of command names — ignoring",
            );
        });

        test('reads skills.builtin', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ skills: { builtin: false } }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.skills?.builtin).toBe(false);
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('strips skills.builtin when not a boolean and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ skills: { builtin: 'no' } }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.skills?.builtin).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith(
                "[apijack] .apijack/settings.json: 'skills.builtin' must be a boolean — ignoring",
            );
        });

        test('strips skills when it is not an object and warns', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ skills: true }));

            const settings = loadProjectSettings(testRoot);

            expect(settings.skills).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith(
                "[apijack] .apijack/settings.json: 'skills' must be an object — ignoring",
            );
        });

        test('leaves a valid settings file unchanged with no warnings, including unknown keys', () => {
            mkdirSync(testRoot, { recursive: true });
            const valid = {
                customCommands: { defaults: { requiresAuth: true } },
                auth: { refreshOn: [401] },
                someFutureOption: 'preserved',
            };
            writeFileSync(join(testRoot, 'settings.json'), JSON.stringify(valid));

            const settings = loadProjectSettings(testRoot);

            expect(settings).toEqual(valid);
            expect(warnSpy).not.toHaveBeenCalled();
        });

        test('returns {} and warns when top-level value is not an object (array)', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), '[1,2,3]');

            const settings = loadProjectSettings(testRoot);

            expect(settings).toEqual({});
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain('settings must be a JSON object');
        });

        test('returns {} and warns when top-level value is not an object (string)', () => {
            mkdirSync(testRoot, { recursive: true });
            writeFileSync(join(testRoot, 'settings.json'), '"hello"');

            const settings = loadProjectSettings(testRoot);

            expect(settings).toEqual({});
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0][0]).toContain('settings must be a JSON object');
        });
    });
});
