import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { patchCliState, readCliState } from '../../src/skills/state';

const root = join(tmpdir(), 'apijack-skill-state-' + Date.now());
const statePath = join(root, '.apijack', 'skills-state.json');

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('skills state', () => {
    test('readCliState returns {} when the file is missing', () => {
        expect(readCliState(statePath, 'mycli')).toEqual({});
    });

    test('readCliState returns {} on corrupt JSON', () => {
        mkdirSync(join(root, '.apijack'), { recursive: true });
        writeFileSync(statePath, '{ nope');

        expect(readCliState(statePath, 'mycli')).toEqual({});
    });

    test('readCliState drops fields with the wrong shape', () => {
        mkdirSync(join(root, '.apijack'), { recursive: true });
        writeFileSync(statePath, JSON.stringify({ mycli: { seen: 5, declined: 'yes', lastNotice: 7 } }));

        expect(readCliState(statePath, 'mycli')).toEqual({});
    });

    test('readCliState keeps only string entries of seen', () => {
        mkdirSync(join(root, '.apijack'), { recursive: true });
        writeFileSync(statePath, JSON.stringify({ mycli: { seen: ['a', 3], declined: true } }));

        expect(readCliState(statePath, 'mycli')).toEqual({ declined: true });
    });

    test('patchCliState merges per CLI and keeps other CLIs', () => {
        patchCliState(statePath, 'mycli', { declined: true });
        patchCliState(statePath, 'other', { seen: ['a'] });
        patchCliState(statePath, 'mycli', { lastNotice: '2026-01-01T00:00:00.000Z' });

        expect(readCliState(statePath, 'mycli')).toEqual({ declined: true, lastNotice: '2026-01-01T00:00:00.000Z' });
        expect(JSON.parse(readFileSync(statePath, 'utf-8')).other).toEqual({ seen: ['a'] });
    });

    test('patchCliState recovers from a corrupt file', () => {
        mkdirSync(join(root, '.apijack'), { recursive: true });
        writeFileSync(statePath, 'garbage');

        patchCliState(statePath, 'mycli', { declined: true });

        expect(readCliState(statePath, 'mycli')).toEqual({ declined: true });
    });
});
