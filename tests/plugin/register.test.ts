import { describe, test, expect } from 'bun:test';
import { pluginInstallAction } from '../../src/plugin/register';

describe('pluginInstallAction()', () => {
    test('installs skills the new way before the plugin install clears its copies', async () => {
        const events: string[] = [];

        await pluginInstallAction({
            migrateSkills: () => {
                events.push('migrate');
            },
            install: async ({ clearSkills }) => {
                events.push(`install clearSkills=${clearSkills}`);
            },
        });

        expect(events).toEqual(['migrate', 'install clearSkills=true']);
    });

    test('when installing the skills fails, the plugin keeps its copies', async () => {
        const events: string[] = [];
        const errors: string[] = [];
        const origErr = console.error;
        console.error = (...a: unknown[]) => errors.push(a.join(' '));

        try {
            await pluginInstallAction({
                migrateSkills: () => {
                    throw new Error('EACCES: permission denied');
                },
                install: async ({ clearSkills }) => {
                    events.push(`install clearSkills=${clearSkills}`);
                },
            });
        } finally {
            console.error = origErr;
        }

        expect(events).toEqual(['install clearSkills=false']);
        expect(errors.join('\n')).toContain("keeping the plugin's copies");
        expect(errors.join('\n')).toContain('EACCES');
    });

    test('when the migration asks to keep them, the plugin keeps its copies', async () => {
        const events: string[] = [];

        await pluginInstallAction({
            migrateSkills: () => ({ keepPluginSkills: true }),
            install: async ({ clearSkills }) => {
                events.push(`install clearSkills=${clearSkills}`);
            },
        });

        expect(events).toEqual(['install clearSkills=false']);
    });

    test('without a migration step it clears the plugin\'s skills', async () => {
        const events: string[] = [];

        await pluginInstallAction({
            install: async ({ clearSkills }) => {
                events.push(`install clearSkills=${clearSkills}`);
            },
        });

        expect(events).toEqual(['install clearSkills=true']);
    });
});
