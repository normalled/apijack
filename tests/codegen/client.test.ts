import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { generateClient } from '../../src/codegen/client';
import type { OpenApiOperation } from '../../src/codegen/openapi-types';
import fixture from '../fixtures/petstore.json';

const schemas = fixture.components.schemas as Record<string, any>;

describe('generateClient — unit tests', () => {
    it('generates the generic ApiClient class', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {};
        const output = generateClient(paths);
        expect(output).toContain('export class ApiClient {');
    });

    it('generates method with path params for GET endpoint', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items/{id}': {
                get: {
                    operationId: 'getItem',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                },
            },
        };
        const output = generateClient(paths);
        expect(output).toContain('async getItem(id: number)');
        // Path template uses backtick interpolation for path params
        expect(output).toContain('return this.request("GET", `/items/${id}`');
    });

    it('generates method with body param for POST endpoint', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items': {
                post: {
                    operationId: 'createItem',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CreateItemDto' },
                            },
                        },
                    },
                },
            },
        };
        const output = generateClient(paths);
        expect(output).toContain(
            'async createItem(body: CreateItemDto)',
        );
        expect(output).toContain(', { body }');
    });

    it('passes query params through', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items': {
                get: {
                    operationId: 'listItems',
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer' } },
                        { name: 'size', in: 'query', schema: { type: 'integer' } },
                    ],
                },
            },
        };
        const output = generateClient(paths);
        expect(output).toContain('params?: { page?: number; size?: number }');
        expect(output).toContain(', { params }');
    });

    it('handles endpoint with path params, body, and query params', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items/{id}': {
                put: {
                    operationId: 'updateItem',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                        { name: 'notify', in: 'query', schema: { type: 'boolean' } },
                    ],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UpdateItemDto' },
                            },
                        },
                    },
                },
            },
        };
        const output = generateClient(paths);
        expect(output).toContain(
            'async updateItem(id: number, body: UpdateItemDto, params?: { notify?: boolean })',
        );
        expect(output).toContain(', { params, body }');
    });

    it('includes auto-generated header', () => {
        const output = generateClient({});
        expect(output).toContain('// Auto-generated');
    });

    it('includes request method with fetch logic', () => {
        const output = generateClient({});
        expect(output).toContain('private async request(');
        expect(output).toContain('fetch(');
        expect(output).toContain('JSON.stringify');
    });

    it('skips operations without operationId', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items': {
                get: {
                    tags: ['items'],
                    // no operationId
                },
            },
        };
        const output = generateClient(paths);
        // Should only have the class shell, no methods beyond request
        expect(output).not.toContain('async list');
    });

    it('generates correct path template for endpoint without path params', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items': {
                get: {
                    operationId: 'listItems',
                },
            },
        };
        const output = generateClient(paths);
        expect(output).toContain('return this.request("GET", "/items")');
    });

    it('exports PreRequestHook type', () => {
        const output = generateClient({});
        expect(output).toContain(
            'export type PreRequestHook = (req: { method: string; url: string; body?: unknown }) => void;',
        );
    });

    it('exports RequestInterceptor type', () => {
        const output = generateClient({});
        expect(output).toContain(
            'export type RequestInterceptor = (req: { method: string; url: string; body?: unknown }) => unknown | undefined;',
        );
    });

    it('exports HeadersProvider type', () => {
        const output = generateClient({});
        expect(output).toContain(
            'export type HeadersProvider = (method: string) => Record<string, string>;',
        );
    });

    it('generates preRequest hook property', () => {
        const output = generateClient({});
        expect(output).toContain('preRequest?: PreRequestHook');
    });

    it('generates interceptRequest hook property', () => {
        const output = generateClient({});
        expect(output).toContain('interceptRequest?: RequestInterceptor');
    });

    it('generates ensureReady hook property', () => {
        const output = generateClient({});
        expect(output).toContain('ensureReady?: () => Promise<void>');
    });

    it('does not generate dryRun property', () => {
        const output = generateClient({});
        expect(output).not.toContain('dryRun');
    });

    it('does not generate CapturedRequest interface', () => {
        const output = generateClient({});
        expect(output).not.toContain('export interface CapturedRequest');
    });
});

describe('generateClient — petstore fixture', () => {
    const output = generateClient(fixture.paths as any, schemas);

    it('generates class with method per operationId', () => {
        expect(output).toContain('export class ApiClient {');
        expect(output).toContain('async adminGetMatters(');
        expect(output).toContain('async adminCreateMatter(');
        expect(output).toContain('async adminGetMatter(');
        expect(output).toContain('async adminDeleteMatter(');
        expect(output).toContain('async getUsers(');
    });

    it('path params become method parameters', () => {
        expect(output).toContain('matterId: number');
    });

    it('query params become optional params object', () => {
        expect(output).toContain('params?: { status?: string }');
    });

    it('request body becomes body parameter', () => {
        expect(output).toContain('body: CreateMatterRequest');
    });

    it('generates correct HTTP method in request call', () => {
        expect(output).toContain('this.request("GET", "/admin/matters"');
        expect(output).toContain('this.request("POST", "/admin/matters"');
        expect(output).toContain('this.request("DELETE", `/admin/matters/${matterId}`');
    });

    // Response types
    it('typed return for $ref response', () => {
        expect(output).toMatch(/async adminGetMatter\(.*\): Promise<MatterDto>/);
    });

    it('typed return for array response', () => {
        expect(output).toMatch(/async adminGetMatters\(.*\): Promise<MatterDto\[\]>/);
    });

    it('void return for no-body response', () => {
        expect(output).toMatch(/async adminDeleteMatter\(.*\): Promise<void>/);
    });

    it('typed return for 201 response', () => {
        expect(output).toMatch(/async createItem\(.*\): Promise<DescribedDto>/);
    });

    // Type imports
    it('generates import statement for referenced types', () => {
        expect(output).toContain('import type {');
        expect(output).toContain('MatterDto');
        expect(output).toContain('CreateMatterRequest');
        expect(output).toContain('DescribedDto');
        expect(output).toContain('} from "./types";');
    });

    // Operation JSDoc
    it('emits operation summary as JSDoc', () => {
        expect(output).toContain('/** List all items');
    });

    it('emits operation description in JSDoc body', () => {
        expect(output).toContain('Returns a paginated list of items matching the filter criteria');
    });

    it('emits HTTP method and path in JSDoc', () => {
        expect(output).toContain('GET /described/items');
        expect(output).toContain('POST /described/items');
    });

    it('emits @param tags with descriptions', () => {
        expect(output).toContain('@param itemId');
        expect(output).toContain('The unique item identifier');
    });

    it('emits @param for body with description', () => {
        expect(output).toContain('@param body');
    });

    // Deprecated
    it('deprecated operation emits @deprecated JSDoc', () => {
        expect(output).toContain('@deprecated');
        expect(output).toContain('Delete an item');
    });
});

describe('generateClient — behavioral tests (ensureReady)', () => {
    const tmpDir = join(import.meta.dir, '.tmp-client-behavioral');
    let ApiClient: new (...args: unknown[]) => Record<string, unknown>;

    beforeAll(async () => {
        mkdirSync(tmpDir, { recursive: true });
        const source = generateClient({
            '/items': {
                get: { operationId: 'listItems' },
            },
        } as Record<string, Record<string, OpenApiOperation>>);
        writeFileSync(join(tmpDir, 'client.ts'), source);
        const mod = await import(join(tmpDir, 'client.ts'));
        ApiClient = mod.ApiClient;
    });

    afterAll(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejected ensureReady clears promise cache, allowing retry', async () => {
        let callCount = 0;
        const client = new ApiClient('http://example.com', () => ({}));
        client.ensureReady = async () => {
            callCount++;

            if (callCount === 1) throw new Error('transient failure');
        };

        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;

        try {
            // First call — ensureReady rejects
            await expect((client as any).listItems()).rejects.toThrow('transient failure');

            // Second call — ensureReady succeeds (cache was cleared on rejection)
            await (client as any).listItems();
            expect(callCount).toBe(2);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('concurrent requests share the same ensureReady promise', async () => {
        let callCount = 0;
        const client = new ApiClient('http://example.com', () => ({}));
        client.ensureReady = async () => {
            callCount++;
            await new Promise(r => setTimeout(r, 10));
        };

        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;

        try {
            await Promise.all([(client as any).listItems(), (client as any).listItems()]);
            expect(callCount).toBe(1);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});
