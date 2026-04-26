import { mkdir } from 'fs/promises';
import { generateTypes } from './types';
import { generateClient } from './client';
import { generateCommands } from './commands';
import { generateCommandMap } from './command-map';
import type { OpenApiOperation, OpenApiSchema } from './openapi-types';
import type { AuthStrategy } from '../auth/types';
import type { SessionManager } from '../session';

export interface GenerateOptions {
    spec: {
        paths: Record<string, Record<string, OpenApiOperation>>;
        components?: { schemas?: Record<string, OpenApiSchema> };
    };
    outDir: string;
}

export interface FetchSpecOptions {
    baseUrl: string;
    specPath: string;
    auth?: { username: string; password: string };
    strategy?: AuthStrategy;
    sessionManager?: SessionManager;
}

export interface FetchAndGenerateOptions {
    baseUrl: string;
    specPath: string;
    outDir: string;
    auth?: { username: string; password: string };
}

export async function generate(opts: GenerateOptions): Promise<void> {
    const schemas = opts.spec.components?.schemas || {};
    const paths = opts.spec.paths || {};

    const typesContent = generateTypes(schemas);
    const clientContent = generateClient(paths, schemas);
    const commandsContent = generateCommands(paths, schemas);
    const commandMapContent = generateCommandMap(paths, schemas);

    await mkdir(opts.outDir, { recursive: true });

    await Bun.write(`${opts.outDir}/types.ts`, typesContent);
    await Bun.write(`${opts.outDir}/client.ts`, clientContent);
    await Bun.write(`${opts.outDir}/commands.ts`, commandsContent);
    await Bun.write(`${opts.outDir}/command-map.ts`, commandMapContent);
}

export async function fetchSpec(opts: FetchSpecOptions): Promise<unknown> {
    const buildHeaders = async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = { Accept: 'application/json' };

        if (opts.strategy && opts.sessionManager && opts.auth) {
            const session = await opts.sessionManager.resolve(opts.strategy, {
                baseUrl: opts.baseUrl,
                username: opts.auth.username,
                password: opts.auth.password,
            });
            Object.assign(headers, session.headers);
        } else if (opts.auth) {
            headers.Authorization
                = 'Basic ' + btoa(`${opts.auth.username}:${opts.auth.password}`);
        }

        return headers;
    };

    const url = `${opts.baseUrl}${opts.specPath}`;
    let res = await fetch(url, { headers: await buildHeaders() });

    // Cached session may be stale — invalidate + retry once on 401
    if (res.status === 401 && opts.strategy && opts.sessionManager) {
        opts.sessionManager.invalidate();
        res = await fetch(url, { headers: await buildHeaders() });
    }

    if (!res.ok) {
        throw new Error(
            `Failed to fetch spec from ${url}: ${res.status} ${res.statusText}`,
        );
    }

    return res.json();
}

export async function fetchAndGenerate(
    opts: FetchAndGenerateOptions,
): Promise<void> {
    const spec = await fetchSpec(opts);
    await generate({
        spec: spec as GenerateOptions['spec'],
        outDir: opts.outDir,
    });
}
