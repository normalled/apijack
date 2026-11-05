import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { claudeDir, claudeSkillsDir, skillsStatePath } from '../../src/skills/paths';

describe('skills paths', () => {
    test('claudeDir uses CLAUDE_CONFIG_DIR when set', () => {
        expect(claudeDir({ CLAUDE_CONFIG_DIR: '/x' }, '/h')).toBe('/x');
    });

    test('claudeDir defaults to ~/.claude', () => {
        expect(claudeDir({}, '/h')).toBe(join('/h', '.claude'));
    });

    test('claudeDir ignores an empty CLAUDE_CONFIG_DIR', () => {
        expect(claudeDir({ CLAUDE_CONFIG_DIR: '' }, '/h')).toBe(join('/h', '.claude'));
    });

    test('claudeSkillsDir is <claude-dir>/skills', () => {
        expect(claudeSkillsDir({ CLAUDE_CONFIG_DIR: '/x' }, '/h')).toBe(join('/x', 'skills'));
    });

    test('skillsStatePath is ~/.apijack/skills-state.json', () => {
        expect(skillsStatePath('/h')).toBe(join('/h', '.apijack', 'skills-state.json'));
    });
});
