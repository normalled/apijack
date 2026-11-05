import { describe, test, expect, afterEach } from 'bun:test';
import { join } from 'path';
import { userHome } from '../src/home';
import { skillsStatePath, claudeDir } from '../src/skills/paths';
import { getPluginPaths } from '../src/plugin/paths';

// Bun's os.homedir() is fixed at startup, so code that only uses it ignores a
// HOME a test points elsewhere — and writes to the real ~/.apijack.
describe('userHome()', () => {
    const original = process.env.HOME;

    afterEach(() => {
        if (original === undefined) delete process.env.HOME;
        else process.env.HOME = original;
    });

    test('follows HOME set at runtime', () => {
        process.env.HOME = '/tmp/apijack-home-test';

        expect(userHome()).toBe('/tmp/apijack-home-test');
    });

    test('skills and plugin paths follow HOME set at runtime', () => {
        process.env.HOME = '/tmp/apijack-home-test';

        expect(skillsStatePath()).toBe(join('/tmp/apijack-home-test', '.apijack', 'skills-state.json'));
        expect(claudeDir({})).toBe(join('/tmp/apijack-home-test', '.claude'));
        expect(getPluginPaths('1.0.0').marketplaceDir).toBe(join('/tmp/apijack-home-test', '.apijack', 'plugin-marketplace'));
    });
});
