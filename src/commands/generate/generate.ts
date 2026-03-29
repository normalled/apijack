import { Command } from 'commander';
import { getActiveEnvConfig } from '../../config';
import { fetchAndGenerate as defaultFetchAndGenerate } from '../../codegen/index';

export interface GenerateInput {
    env: { url: string; user: string; password: string } | null;
    specPath: string;
    outDir: string;
    fetchAndGenerate: (opts: { baseUrl: string; specPath: string; outDir: string; auth: { username: string; password: string } }) => Promise<void>;
}

export async function generateAction(input: GenerateInput): Promise<void> {
    if (!input.env) {
        throw new Error('No active environment.');
    }
    await input.fetchAndGenerate({
        baseUrl: input.env.url,
        specPath: input.specPath,
        outDir: input.outDir,
        auth: { username: input.env.user, password: input.env.password },
    });
}

export function registerGenerateCommand(
    program: Command,
    cliName: string,
    specPath: string,
    generatedDir: string,
    configOpts?: { configPath: string },
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
                    fetchAndGenerate: defaultFetchAndGenerate,
                });
                console.log(`Generated files written to ${generatedDir}`);
            } catch (err) {
                console.error('Generation failed:', err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });
}
