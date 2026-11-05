import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { RenderedSkill } from '../../src/skills/render';
import {
    MARKER_FILE,
    ownedInstalls,
    readMarker,
    removeOwned,
    skillStatuses,
    writeSkill,
} from '../../src/skills/store';

const skillsDir = join(tmpdir(), 'apijack-skill-store-' + Date.now());
const enc = new TextEncoder();

function rendered(skill: string, hash = 'sha256:aaa', files: Record<string, string> = { 'SKILL.md': 'x' }): RenderedSkill {
    return {
        skill,
        installName: `mycli-${skill}`,
        source: 'builtin',
        files: Object.entries(files).map(([path, c]) => ({ path, content: enc.encode(c) })),
        hash,
    };
}

const statusOf = (entries: ReturnType<typeof skillStatuses>, skill: string) =>
    entries.find(e => e.skill === skill)?.status;

afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
});

describe('skillStatuses()', () => {
    test('not installed, then up to date after writeSkill, then outdated when the hash changes', () => {
        expect(statusOf(skillStatuses('mycli', [rendered('a')], skillsDir), 'a')).toBe('not installed');

        writeSkill(rendered('a'), 'mycli', skillsDir);
        expect(statusOf(skillStatuses('mycli', [rendered('a')], skillsDir), 'a')).toBe('up to date');
        expect(statusOf(skillStatuses('mycli', [rendered('a', 'sha256:bbb')], skillsDir), 'a')).toBe('outdated');
    });

    test('orphaned: an owned install whose skill is no longer in the sources', () => {
        writeSkill(rendered('gone'), 'mycli', skillsDir);

        const entries = skillStatuses('mycli', [rendered('a')], skillsDir);

        expect(entries).toContainEqual({ skill: 'gone', installName: 'mycli-gone', status: 'orphaned' });
    });

    test('conflict: a directory with no marker, or another CLI\'s marker', () => {
        mkdirSync(join(skillsDir, 'mycli-a'), { recursive: true });
        writeFileSync(join(skillsDir, 'mycli-a', 'SKILL.md'), 'mine');
        writeSkill({ ...rendered('b'), installName: 'mycli-b' }, 'othercli', skillsDir);

        const entries = skillStatuses('mycli', [rendered('a'), rendered('b')], skillsDir);

        expect(statusOf(entries, 'a')).toBe('conflict');
        expect(statusOf(entries, 'b')).toBe('conflict');
    });

    test('a missing skills dir means everything is not installed', () => {
        expect(skillStatuses('mycli', [rendered('a')], join(skillsDir, 'nope'))).toEqual([
            { skill: 'a', installName: 'mycli-a', status: 'not installed' },
        ]);
    });
});

describe('readMarker()', () => {
    test('returns null on corrupt JSON', () => {
        mkdirSync(join(skillsDir, 'x'), { recursive: true });
        writeFileSync(join(skillsDir, 'x', MARKER_FILE), '{ truncated');

        expect(readMarker(join(skillsDir, 'x'))).toBeNull();
    });

    test('returns null when fields are missing', () => {
        mkdirSync(join(skillsDir, 'x'), { recursive: true });
        writeFileSync(join(skillsDir, 'x', MARKER_FILE), JSON.stringify({ cli: 'mycli' }));

        expect(readMarker(join(skillsDir, 'x'))).toBeNull();
    });
});

describe('writeSkill() / removeOwned() / ownedInstalls()', () => {
    test('writeSkill writes files and a marker', () => {
        writeSkill(rendered('a', 'sha256:h', { 'SKILL.md': 'hello', 'ref/b.md': 'b' }), 'mycli', skillsDir);
        const dir = join(skillsDir, 'mycli-a');

        expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toBe('hello');
        expect(readFileSync(join(dir, 'ref', 'b.md'), 'utf-8')).toBe('b');
        expect(readMarker(dir)).toMatchObject({ cli: 'mycli', skill: 'a', source: 'builtin', hash: 'sha256:h' });
    });

    test('writeSkill removes stale files from a previous version', () => {
        writeSkill(rendered('a', 'sha256:1', { 'SKILL.md': 'v1', 'old.md': 'old' }), 'mycli', skillsDir);
        writeSkill(rendered('a', 'sha256:2', { 'SKILL.md': 'v2' }), 'mycli', skillsDir);

        expect(existsSync(join(skillsDir, 'mycli-a', 'old.md'))).toBe(false);
        expect(readFileSync(join(skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toBe('v2');
    });

    test('removeOwned refuses an unowned directory and leaves its files intact', () => {
        const dir = join(skillsDir, 'mycli-a');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'SKILL.md'), 'user content');

        expect(removeOwned(dir, 'mycli')).toBe(false);
        expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toBe('user content');
    });

    test('removeOwned removes this CLI\'s install', () => {
        writeSkill(rendered('a'), 'mycli', skillsDir);

        expect(removeOwned(join(skillsDir, 'mycli-a'), 'mycli')).toBe(true);
        expect(existsSync(join(skillsDir, 'mycli-a'))).toBe(false);
    });

    test('ownedInstalls lists only this CLI\'s marked directories', () => {
        writeSkill(rendered('a'), 'mycli', skillsDir);
        writeSkill({ ...rendered('b'), installName: 'other-b' }, 'other', skillsDir);
        mkdirSync(join(skillsDir, 'plain'), { recursive: true });

        expect(ownedInstalls('mycli', skillsDir).map(o => o.marker.skill)).toEqual(['a']);
    });
});

describe('ownership requires the expected directory name', () => {
    test('a copied install under another name is not owned, so uninstall-style removal leaves it', () => {
        writeSkill(rendered('a'), 'mycli', skillsDir);
        const copy = join(skillsDir, 'my-routines');
        mkdirSync(copy, { recursive: true });
        writeFileSync(join(copy, 'SKILL.md'), 'customised');
        writeFileSync(join(copy, MARKER_FILE), readFileSync(join(skillsDir, 'mycli-a', MARKER_FILE)));

        expect(ownedInstalls('mycli', skillsDir).map(o => o.dir)).toEqual([join(skillsDir, 'mycli-a')]);
        expect(removeOwned(copy, 'mycli')).toBe(false);
        expect(readFileSync(join(copy, 'SKILL.md'), 'utf-8')).toBe('customised');
    });

    test('a marker whose skill does not match its directory is a conflict, never also orphaned', () => {
        writeSkill(rendered('a'), 'mycli', skillsDir);
        const markerPath = join(skillsDir, 'mycli-a', MARKER_FILE);
        writeFileSync(markerPath, readFileSync(markerPath, 'utf-8').replace('"skill": "a"', '"skill": "zzz"'));

        expect(skillStatuses('mycli', [rendered('a')], skillsDir)).toEqual([
            { skill: 'a', installName: 'mycli-a', status: 'conflict' },
        ]);
    });
});
