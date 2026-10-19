import { describe, test, expect } from 'bun:test';
import {
    scanLeadingOptions,
    PROGRAM_OPTIONS,
    type LeadingOptionSpec,
} from '../src/leading-options';

describe('scanLeadingOptions()', () => {
    test('returns no options and an empty rest for no args', () => {
        expect(scanLeadingOptions([])).toEqual({ options: [], leading: [], rest: [] });
    });

    test('a leading command token ends the scan immediately', () => {
        expect(scanLeadingOptions(['routine', 'list', '--quiet'])).toEqual({
            options: [],
            leading: [],
            rest: ['routine', 'list', '--quiet'],
        });
    });

    test('skips leading boolean program options to find the command', () => {
        expect(scanLeadingOptions(['--quiet', '--table', '--dry-run', 'routine', 'list'])).toEqual({
            options: [
                { flag: '--quiet', tokens: ['--quiet'], known: true },
                { flag: '--table', tokens: ['--table'], known: true },
                { flag: '--dry-run', tokens: ['--dry-run'], known: true },
            ],
            leading: ['--quiet', '--table', '--dry-run'],
            rest: ['routine', 'list'],
        });
    });

    test('-o consumes the next token as its value, not as the command', () => {
        expect(scanLeadingOptions(['-o', 'json', 'config', 'list'])).toEqual({
            options: [{ flag: '-o', value: 'json', tokens: ['-o', 'json'], known: true }],
            leading: ['-o', 'json'],
            rest: ['config', 'list'],
        });
    });

    test('-o takes an attached value (-ojson)', () => {
        expect(scanLeadingOptions(['-ojson', 'config', 'list'])).toEqual({
            options: [{ flag: '-o', value: 'json', tokens: ['-ojson'], known: true }],
            leading: ['-ojson'],
            rest: ['config', 'list'],
        });
    });

    test('a value option consumes the next token even when it looks like an option', () => {
        // Matches Commander: a required option-argument takes the next arg as-is.
        expect(scanLeadingOptions(['-o', '--quiet', 'routine'])).toEqual({
            options: [{ flag: '-o', value: '--quiet', tokens: ['-o', '--quiet'], known: true }],
            leading: ['-o', '--quiet'],
            rest: ['routine'],
        });
    });

    test('a trailing value option with no value consumes nothing more', () => {
        expect(scanLeadingOptions(['-o'])).toEqual({
            options: [{ flag: '-o', tokens: ['-o'], known: true }],
            leading: ['-o'],
            rest: [],
        });
    });

    test('-V/--version and -h/--help are known leading options', () => {
        expect(scanLeadingOptions(['--quiet', '-V']).options).toEqual([
            { flag: '--quiet', tokens: ['--quiet'], known: true },
            { flag: '-V', tokens: ['-V'], known: true },
        ]);
        expect(scanLeadingOptions(['--help', 'routine']).options).toEqual([
            { flag: '--help', tokens: ['--help'], known: true },
        ]);
    });

    test('-- ends option scanning and the token after it is the command', () => {
        expect(scanLeadingOptions(['--quiet', '--', 'routine', 'list'])).toEqual({
            options: [{ flag: '--quiet', tokens: ['--quiet'], known: true }],
            leading: ['--quiet', '--'],
            rest: ['routine', 'list'],
        });
    });

    test('a bare - is an operand, not an option', () => {
        expect(scanLeadingOptions(['-', 'routine']).rest).toEqual(['-', 'routine']);
    });

    test('an unknown leading option is skipped as a boolean flag', () => {
        expect(scanLeadingOptions(['--bogus', 'routine', 'list'])).toEqual({
            options: [{ flag: '--bogus', tokens: ['--bogus'], known: false }],
            leading: ['--bogus'],
            rest: ['routine', 'list'],
        });
    });

    test('an unknown --opt=value is skipped as one token', () => {
        expect(scanLeadingOptions(['--tenant=5', 'routine', 'list'])).toEqual({
            options: [{ flag: '--tenant', value: '5', tokens: ['--tenant=5'], known: false }],
            leading: ['--tenant=5'],
            rest: ['routine', 'list'],
        });
    });

    describe('with an extra long value option in the table', () => {
        const specs: LeadingOptionSpec[] = [
            ...PROGRAM_OPTIONS,
            { flags: ['--profile'], takesValue: true },
        ];

        test('--opt value consumes the next token', () => {
            expect(scanLeadingOptions(['--quiet', '--profile', 'dev', 'routine'], specs)).toEqual({
                options: [
                    { flag: '--quiet', tokens: ['--quiet'], known: true },
                    { flag: '--profile', value: 'dev', tokens: ['--profile', 'dev'], known: true },
                ],
                leading: ['--quiet', '--profile', 'dev'],
                rest: ['routine'],
            });
        });

        test('--opt=value carries its value inline', () => {
            expect(scanLeadingOptions(['--profile=dev', '-o', 'table', 'routine'], specs)).toEqual({
                options: [
                    { flag: '--profile', value: 'dev', tokens: ['--profile=dev'], known: true },
                    { flag: '-o', value: 'table', tokens: ['-o', 'table'], known: true },
                ],
                leading: ['--profile=dev', '-o', 'table'],
                rest: ['routine'],
            });
        });

        test('the default table does not know the extra option', () => {
            // Without the row, `--profile` is an unknown boolean and `dev` is
            // taken as the command — the row is what makes the value consumable.
            expect(scanLeadingOptions(['--profile', 'dev', 'routine']).rest).toEqual(['dev', 'routine']);
        });
    });
});
