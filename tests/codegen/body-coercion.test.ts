import { describe, it, expect } from 'bun:test';
import { generateCommands } from '../../src/codegen/commands';
import type {
    OpenApiOperation,
    OpenApiSchema,
} from '../../src/codegen/openapi-types';

// Regression tests for issue #116: the object-body branch of the command
// generator shipped every body prop verbatim, so Commander's always-string
// option values reached the API uncoerced (arrays/objects as raw strings →
// 400; numbers/booleans as "42"/"true"). Each body prop now carries a
// `coerce` kind computed at BodyProp construction, and the generated action
// coerces accordingly. These tests assert the emitted source both (a) parses
// as valid TypeScript and (b) actually coerces at runtime.

const transpiler = new Bun.Transpiler({ loader: 'ts' });

function expectParses(code: string): void {
    expect(() => transpiler.transformSync(code)).not.toThrow();
}

/**
 * Generate a single POST /items command whose body is `Dto` with the given
 * properties. `extraSchemas` supplies any `$ref` targets referenced by props.
 */
function gen(
    properties: Record<string, OpenApiSchema>,
    extraSchemas: Record<string, OpenApiSchema> = {},
): string {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
        '/items': {
            post: {
                operationId: 'createItem',
                tags: ['items'],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Dto' },
                        },
                    },
                },
            },
        },
    };
    const schemas: Record<string, OpenApiSchema> = {
        Dto: { type: 'object', properties },
        ...extraSchemas,
    };

    return generateCommands(paths, schemas);
}

/**
 * Extract the object-body building block from the generated action and run it
 * against a supplied `opts`, returning the assembled body object. Exercises the
 * exact emitted source (minus the `as string` casts TS-only tokens).
 */
function runCoercion(
    source: string,
    opts: Record<string, unknown>,
): Record<string, unknown> {
    const marker = 'const obj: Record<string, unknown> = {};';
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('body = ', start);
    const block = source
        .slice(start + marker.length, end)
        .replace(/ as string/g, '');

    const build = new Function(
        'opts',
        `const obj = {};\n${block}\nreturn obj;`,
    ) as (o: Record<string, unknown>) => Record<string, unknown>;

    return build(opts);
}

describe('#116 body-prop coercion — emitted source', () => {
    it('number/integer props coerce via Number() with a NaN guard', () => {
        const src = gen({ count: { type: 'integer' }, ratio: { type: 'number' } });
        expectParses(src);
        expect(src).toContain('const n = Number(opts.count);');
        expect(src).toContain('Number.isNaN(n)');
        expect(src).toContain('--count expects a number');
        expect(src).not.toContain('obj["count"] = opts.count;');
    });

    it('boolean props coerce via === "true"', () => {
        const src = gen({ flagged: { type: 'boolean' } });
        expectParses(src);
        expect(src).toContain('obj["flagged"] = opts.flagged === "true";');
    });

    it('array props parse as JSON with a per-flag error', () => {
        const src = gen({ tags: { type: 'array', items: { type: 'string' } } });
        expectParses(src);
        expect(src).toContain('JSON.parse(opts.tags as string)');
        expect(src).toContain('--tags expects JSON');
    });

    it('inline object props parse as JSON', () => {
        const src = gen({
            meta: { type: 'object', properties: { k: { type: 'string' } } },
        });
        expectParses(src);
        expect(src).toContain('JSON.parse(opts.meta as string)');
    });

    it('string props pass through unchanged', () => {
        const src = gen({ name: { type: 'string' } });
        expectParses(src);
        expect(src).toContain('obj["name"] = opts.name;');
        expect(src).not.toContain('JSON.parse(opts.name');
        expect(src).not.toContain('Number(opts.name)');
    });

    it('a $ref to a string enum stays a string (no JSON parse)', () => {
        const src = gen(
            { status: { $ref: '#/components/schemas/Status' } },
            { Status: { type: 'string', enum: ['open', 'closed'] } },
        );
        expectParses(src);
        expect(src).toContain('obj["status"] = opts.status;');
        expect(src).not.toContain('JSON.parse(opts.status');
    });

    it('a $ref to an object becomes JSON', () => {
        const src = gen(
            { address: { $ref: '#/components/schemas/Address' } },
            {
                Address: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                },
            },
        );
        expectParses(src);
        expect(src).toContain('JSON.parse(opts.address as string)');
    });

    it('a numeric enum coerces via Number(), not string passthrough', () => {
        const src = gen({ priority: { type: 'integer', enum: [1, 2, 3] } });
        expectParses(src);
        expect(src).toContain('const n = Number(opts.priority);');
        expect(src).not.toContain('obj["priority"] = opts.priority;');
    });

    it('a boolean enum coerces via === "true"', () => {
        const src = gen({ toggled: { type: 'boolean', enum: [true, false] } });
        expectParses(src);
        expect(src).toContain('obj["toggled"] = opts.toggled === "true";');
    });

    it('a $ref chain to a string enum stays a string', () => {
        const src = gen(
            { status: { $ref: '#/components/schemas/StatusAlias' } },
            {
                StatusAlias: { $ref: '#/components/schemas/Status' },
                Status: { type: 'string', enum: ['open', 'closed'] },
            },
        );
        expectParses(src);
        expect(src).toContain('obj["status"] = opts.status;');
        expect(src).not.toContain('JSON.parse(opts.status');
    });

    it('OAS 3.1 nullable string (array type) stays a passthrough string', () => {
        const src = gen({ name: { type: ['string', 'null'] } });
        expectParses(src);
        expect(src).toContain('obj["name"] = opts.name;');
        expect(src).not.toContain('JSON.parse(opts.name');
    });

    it('OAS 3.1 nullable number (array type) coerces via Number()', () => {
        const src = gen({ count: { type: ['integer', 'null'] } });
        expectParses(src);
        expect(src).toContain('const n = Number(opts.count);');
        expect(src).not.toContain('JSON.parse(opts.count');
    });

    it('OAS 3.1 nullable string (anyOf form) stays a passthrough string', () => {
        const src = gen({
            name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        });
        expectParses(src);
        expect(src).toContain('obj["name"] = opts.name;');
        expect(src).not.toContain('JSON.parse(opts.name');
    });

    it('coerce survives allOf-merged props', () => {
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/items': {
                post: {
                    operationId: 'createItem',
                    tags: ['items'],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Merged' },
                            },
                        },
                    },
                },
            },
        };
        const schemas: Record<string, OpenApiSchema> = {
            Merged: {
                allOf: [
                    { type: 'object', properties: { count: { type: 'integer' } } },
                    {
                        type: 'object',
                        properties: {
                            tags: { type: 'array', items: { type: 'string' } },
                        },
                    },
                ],
            },
        };
        const src = generateCommands(paths, schemas);
        expectParses(src);
        expect(src).toContain('const n = Number(opts.count);');
        expect(src).toContain('JSON.parse(opts.tags as string)');
    });
});

describe('#116 body-prop coercion — runtime behavior', () => {
    it('coerces a number flag to a JS number', () => {
        const body = runCoercion(gen({ count: { type: 'integer' } }), {
            count: '42',
        });
        expect(body.count).toBe(42);
    });

    it('throws a clear error when a number flag is not numeric', () => {
        const src = gen({ count: { type: 'integer' } });
        expect(() => runCoercion(src, { count: 'abc' })).toThrow(
            '--count expects a number',
        );
    });

    it('coerces a boolean flag to a JS boolean', () => {
        const src = gen({ flagged: { type: 'boolean' } });
        expect(runCoercion(src, { flagged: 'true' }).flagged).toBe(true);
        expect(runCoercion(src, { flagged: 'false' }).flagged).toBe(false);
    });

    it('parses an array-of-objects flag into a real array', () => {
        const src = gen({
            lineItems: { type: 'array', items: { type: 'object' } },
        });
        const body = runCoercion(src, {
            lineItems: '[{"id":"a","done":true}]',
        });
        expect(body.lineItems).toEqual([{ id: 'a', done: true }]);
    });

    it('throws a clear JSON error when an array flag is not valid JSON', () => {
        const src = gen({ lineItems: { type: 'array', items: {} } });
        expect(() => runCoercion(src, { lineItems: 'not json' })).toThrow(
            '--lineItems expects JSON',
        );
    });

    it('coerces a numeric-enum flag to a JS number', () => {
        const src = gen({ priority: { type: 'integer', enum: [1, 2, 3] } });
        expect(runCoercion(src, { priority: '2' }).priority).toBe(2);
    });

    it('leaves a string flag untouched', () => {
        const src = gen({ name: { type: 'string' } });
        expect(runCoercion(src, { name: 'hello' }).name).toBe('hello');
    });

    it('passes a nullable string (OAS 3.1) through untouched', () => {
        const src = gen({ name: { type: ['string', 'null'] } });
        expect(runCoercion(src, { name: 'hello' }).name).toBe('hello');
    });

    it('leaves an omitted flag out of the body', () => {
        const src = gen({ name: { type: 'string' }, count: { type: 'integer' } });
        const body = runCoercion(src, { name: 'only-name' });
        expect(body).toEqual({ name: 'only-name' });
    });
});
