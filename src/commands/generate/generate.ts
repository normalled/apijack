import { Command } from 'commander';
import { getActiveEnvConfig } from '../../config';
import {
    fetchSpec as defaultFetchSpec,
    generate as defaultGenerate,
    type FetchSpecOptions,
    type GenerateOptions,
} from '../../codegen/index';
import type { AuthStrategy } from '../../auth/types';
import type { SessionManager } from '../../session';

export interface GenerateInput {
    env: { url: string; user: string; password: string } | null;
    specPath: string;
    outDir: string;
    strategy?: AuthStrategy;
    sessionManager?: SessionManager;
    fetchSpec: (opts: FetchSpecOptions) => Promise<unknown>;
    generate: (opts: GenerateOptions) => Promise<void>;
}

export async function generateAction(input: GenerateInput): Promise<void> {
    if (!input.env) {
        throw new Error('No active environment.');
    }

    const spec = await input.fetchSpec({
        baseUrl: input.env.url,
        specPath: input.specPath,
        auth: { username: input.env.user, password: input.env.password },
        strategy: input.strategy,
        sessionManager: input.sessionManager,
    });

    await input.generate({
        spec: spec as GenerateOptions['spec'],
        outDir: input.outDir,
    });
}

export function registerGenerateCommand(
    program: Command,
    cliName: string,
    specPath: string,
    generatedDir: string,
    configOpts?: { configPath: string },
    strategy?: AuthStrategy,
    sessionManager?: SessionManager | null,
): void {
    program
        .command('generate')
        .description("Regenerate CLI from the active environment's OpenAPI spec")
        .action(async () => {
            const env = getActiveEnvConfig(cliName, configOpts);
            try {
                console.log(`Generating from ${env?.url} ...`);
                await generateAction({
                    env,
                    specPath,
                    outDir: generatedDir,
                    strategy,
                    sessionManager: sessionManager ?? undefined,
                    fetchSpec: defaultFetchSpec,
                    generate: defaultGenerate,
                });
                console.log(`Generated files written to ${generatedDir}`);
            } catch (err) {
                console.error('Generation failed:', err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });
}
