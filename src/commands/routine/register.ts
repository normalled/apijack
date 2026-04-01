import { Command } from 'commander';
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { CommandDispatcher } from '../../types';
import { SessionManager } from '../../session';
import { loadRoutineFile, loadSpecFile, listRoutines, validateRoutine, formatRoutineTree, formatRoutineList } from '../../routine/loader';
import { executeRoutine } from '../../routine/executor';
import { routineListAction } from './list/list';
import { routineRunAction } from './run/run';
import { routineValidateAction } from './validate/validate';
import { routineTestAction } from './test/test';
import { routineInitAction } from './init/init';

export function loadBuiltinRoutines(builtinDir: string): Record<string, string> | undefined {
    if (!existsSync(builtinDir)) return undefined;

    const map: Record<string, string> = {};

    function collect(dir: string, prefix: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = resolve(dir, entry.name);
            const key = prefix ? `${prefix}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                collect(fullPath, key);
            } else if (
                entry.isFile()
                && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
            ) {
                map[key] = readFileSync(fullPath, 'utf-8');
            }
        }
    }

    collect(builtinDir, '');

    return Object.keys(map).length > 0 ? map : undefined;
}

export function registerRoutineCommand(
    program: Command,
    cliName: string,
    routinesDir: string,
    dispatch: CommandDispatcher | undefined,
    builtinRoutinesDir?: string,
): void {
    const builtinsMap = builtinRoutinesDir
        ? loadBuiltinRoutines(builtinRoutinesDir)
        : undefined;

    const routine = program
        .command('routine')
        .description('Manage and run routines');

    routine
        .command('list [path]')
        .description('List available routines (optionally drill into a group)')
        .option('--tree', 'Show full tree structure')
        .action((path: string | undefined, opts: { tree?: boolean }) => {
            const result = routineListAction({
                listRoutines: () => listRoutines(routinesDir, builtinsMap),
                path,
            });

            if (result.length === 0) {
                if (path) {
                    console.log(`No routines found under '${path.replace(/\/+$/, '')}/'`);
                } else {
                    console.log(`No routines found in ~/.${cliName}/routines/`);
                    console.log(`Run '${cliName} routine init' to install built-in routines.`);
                }

                return;
            }

            console.log(
                opts.tree
                    ? formatRoutineTree(result)
                    : formatRoutineList(result, path?.replace(/\/+$/, '')),
            );
        });

    routine
        .command('run <name>')
        .description('Execute a routine')
        .option('--set <pairs...>', 'Override variables (key=value)')
        .option('--dry-run', 'Print resolved commands without executing')
        .action(async (name: string, opts: { set?: string[]; dryRun?: boolean }) => {
            if (!dispatch) {
                console.error(`No active session. Run '${cliName} setup' first.`);
                process.exit(2);
            }

            const overrides: Record<string, unknown> = {};

            for (const s of opts.set || []) {
                const eq = s.indexOf('=');

                if (eq > 0) overrides[s.slice(0, eq)] = s.slice(eq + 1);
            }

            const sessionMgr = new SessionManager(cliName);

            try {
                const def = loadRoutineFile(name, routinesDir, builtinsMap);
                console.log(
                    `Running routine: ${def.name}${def.description ? ` — ${def.description}` : ''}\n`,
                );
                const startTime = Date.now();
                const result = await routineRunAction({
                    loadRoutine: () => def,
                    validateRoutine,
                    executeRoutine,
                    dispatch,
                    overrides,
                    dryRun: opts.dryRun,
                    invalidateSession: () => sessionMgr.invalidate(),
                    onStep: (step, i, total) => {
                        console.log(`\x1b[36m[${i + 1}/${total}]\x1b[0m ${step.name}`);
                    },
                    onIteration: (step, current, total, stepIndex, stepTotal) => {
                        process.stderr.write(`\r\x1b[36m[${stepIndex + 1}/${stepTotal}]\x1b[0m ${step.name} \x1b[36m[${current}/${total}]\x1b[0m\x1b[K`);
                    },
                });

                const elapsed = Date.now() - startTime;
                const mins = Math.floor(elapsed / 60000);
                const secs = ((elapsed % 60000) / 1000).toFixed(1);
                const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                console.log(
                    `\nRoutine ${result.success ? '\x1b[32mcompleted\x1b[0m' : '\x1b[31mfailed\x1b[0m'}: ${result.stepsRun} run, ${result.stepsSkipped} skipped, ${result.stepsFailed} failed (${timeStr})`,
                );

                if (!result.success) process.exit(1);
            } catch (err) {
                console.error(err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });

    routine
        .command('validate <name>')
        .description('Validate a routine YAML file')
        .action((name: string) => {
            const result = routineValidateAction({
                loadRoutine: () => loadRoutineFile(name, routinesDir, builtinsMap),
                validateRoutine,
            });

            if (!result.valid) {
                console.error('Validation errors:');

                for (const e of result.errors) console.error(`  - ${e}`);

                process.exit(1);
            }

            console.log(`Routine "${result.name}" is valid.`);
        });

    routine
        .command('test <name>')
        .description("Run a routine's spec (test) file")
        .option('--set <pairs...>', 'Override variables (key=value)')
        .action(async (name: string, opts: { set?: string[] }) => {
            if (!dispatch) {
                console.error(`No active session. Run '${cliName} setup' first.`);
                process.exit(2);
            }

            const overrides: Record<string, unknown> = {};

            for (const s of opts.set || []) {
                const eq = s.indexOf('=');

                if (eq > 0) overrides[s.slice(0, eq)] = s.slice(eq + 1);
            }

            try {
                console.log(`\x1b[36mTesting routine: ${name}\x1b[0m\n`);

                const result = await routineTestAction({
                    loadSpec: () => loadSpecFile(name, routinesDir, builtinsMap),
                    validateRoutine,
                    executeRoutine,
                    dispatch,
                    overrides,
                    routineName: name,
                    onStep: (step, i, total) => {
                        console.log(
                            `\x1b[36m[${i + 1}/${total}]\x1b[0m ${step.name}${step.assert ? ' \x1b[33m(assert)\x1b[0m' : ''}`,
                        );
                    },
                    onIteration: (step, current, total, stepIndex, stepTotal) => {
                        process.stderr.write(`\r\x1b[36m[${stepIndex + 1}/${stepTotal}]\x1b[0m ${step.name} \x1b[36m[${current}/${total}]\x1b[0m\x1b[K`);
                    },
                });

                console.log('');

                if (result.success) {
                    console.log(`\x1b[32mPASSED\x1b[0m: ${result.stepsRun} steps run, ${result.stepsSkipped} skipped`);
                } else {
                    console.log(`\x1b[31mFAILED\x1b[0m: ${result.stepsRun} steps run, ${result.stepsFailed} failed`);
                    process.exit(1);
                }
            } catch (err) {
                console.error(err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });

    routine
        .command('init')
        .description(`Copy built-in routines to ~/.${cliName}/routines/`)
        .action(() => {
            try {
                const result = routineInitAction({
                    routinesDir,
                    builtinDir: builtinRoutinesDir,
                    exists: existsSync,
                    mkdir: mkdirSync,
                    copy: cpSync,
                    listDir: readdirSync as any,
                });
                console.log(`Installed ${result.installed} routines to ${result.routinesDir}`);
            } catch (err) {
                console.error(err instanceof Error ? err.message : String(err));
            }
        });
}
