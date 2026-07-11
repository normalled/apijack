import { describe, it, expect } from 'bun:test';
import { generateTypes } from '../../src/codegen/types';
import { generateClient } from '../../src/codegen/client';
import { generateCommands } from '../../src/codegen/commands';
import { generateCommandMap } from '../../src/codegen/command-map';

// Regression tests for issue #115: codegen emitted invalid TypeScript for
// real-world specs (Jira Cloud platform v3). Each `expectParses` feeds the
// generated source through Bun's transpiler, which throws on a syntax error —
// so a broken emission fails the test instead of merely differing in text.
const transpiler = new Bun.Transpiler({ loader: 'ts' });

function expectParses(code: string): void {
    // transformSync throws on any syntax error in the emitted source.
    expect(() => transpiler.transformSync(code)).not.toThrow();
}

// -- Bug 1: unescaped description string literals --

describe('#115 bug 1: description strings with newlines/quotes/backslashes', () => {
    const paths = {
        '/things': {
            post: {
                operationId: 'createThing',
                summary: 'Create a thing',
                description: 'Sends a bulk change notification when\nthe issue is updated. Contains a "quote", a \\ backslash, and a */ terminator.',
                tags: ['things'],
                parameters: [
                    {
                        name: 'filter',
                        in: 'query',
                        description: 'Filter text\nwith a newline and a "quote"',
                        schema: { type: 'string' },
                    },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Thing' },
                        },
                    },
                },
            },
        },
    } as any;
    const schemas = {
        Thing: {
            type: 'object',
            properties: {
                note: {
                    type: 'string',
                    description: 'A note field\nspanning lines with a "quote" and */ inside',
                },
            },
        },
    } as any;

    it('generateCommands emits parseable source for multi-line descriptions', () => {
        expectParses(generateCommands(paths, schemas));
    });

    it('generateClient emits parseable JSDoc for descriptions containing */', () => {
        expectParses(generateClient(paths, schemas));
    });

    it('generateCommandMap emits parseable source for descriptions with quotes/newlines', () => {
        expectParses(generateCommandMap(paths, schemas));
    });

    it('generateTypes emits parseable source for a property description containing */', () => {
        // Pins the existing */-escaping in buildJsDoc (util.ts) against regression.
        expectParses(generateTypes(schemas));
    });
});

// -- Bug 2: dotted operationIds emitted as identifiers --

describe('#115 bug 2: dotted operationIds', () => {
    const paths = {
        '/addons/{addonKey}/properties': {
            get: {
                operationId: 'AddonPropertiesResource.getAddonProperties_get',
                tags: ['addons'],
                parameters: [
                    { name: 'addonKey', in: 'path', schema: { type: 'string' } },
                ],
                responses: { 200: { description: 'ok' } },
            },
        },
    } as any;

    it('generateClient emits a valid method identifier', () => {
        expectParses(generateClient(paths, {}));
    });

    it('generateCommands emits a valid call site and variable name', () => {
        expectParses(generateCommands(paths, {}));
    });

    it('command-map operationId string matches the emitted client method name', () => {
        const client = generateClient(paths, {});
        const map = generateCommandMap(paths, {});

        // The generated op method is defined as `  async <sanitized>(` (the
        // built-in `request` method is `  private async request(`).
        const methodMatch = client.match(/\n {2}async ([^\s(]+)\(/);
        expect(methodMatch).not.toBeNull();
        const methodName = methodMatch![1];

        // No dot survived into the emitted identifier.
        expect(methodName).not.toContain('.');

        // The command-map string the dispatcher looks up must match exactly.
        expect(map).toContain(`operationId: "${methodName}"`);
    });
});

// -- #118: colliding operationIds after sanitization --

describe('#118: sanitizeIdentifier collision (Foo.bar vs Foo_bar)', () => {
    // `Foo.bar` and `Foo_bar` both sanitize to `Foo_bar`. Without de-duplication
    // generateClient emits two identical `async Foo_bar(` methods (the second
    // shadows the first) and both command-map entries point at the survivor —
    // wrong-op dispatch at runtime.
    const paths = {
        '/foo-dot': {
            get: {
                operationId: 'Foo.bar',
                tags: ['foo'],
                responses: { 200: { description: 'ok' } },
            },
        },
        '/foo-underscore': {
            get: {
                operationId: 'Foo_bar',
                tags: ['foo'],
                responses: { 200: { description: 'ok' } },
            },
        },
    } as any;

    /** All generated op method names (excludes the built-in `request`). */
    function clientMethodNames(client: string): string[] {
        return [...client.matchAll(/\n {2}async ([^\s(]+)\(/g)].map(m => m[1]);
    }

    it('generateClient emits two distinct method names', () => {
        const client = generateClient(paths, {});
        const names = clientMethodNames(client);
        expect(names).toHaveLength(2);
        expect(new Set(names).size).toBe(2);
        expectParses(client);
    });

    it('each command-map operationId matches a distinct client method name', () => {
        const client = generateClient(paths, {});
        const map = generateCommandMap(paths, {});

        const methodNames = new Set(clientMethodNames(client));
        const mapOpIds = [...map.matchAll(/operationId: "([^"]+)"/g)].map(m => m[1]);

        expect(mapOpIds).toHaveLength(2);
        // Cross-site sync: every command-map operationId resolves to a real,
        // distinct client method.
        expect(new Set(mapOpIds).size).toBe(2);

        for (const opId of mapOpIds) {
            expect(methodNames.has(opId)).toBe(true);
        }
    });

    it('resolves a 3-way collision to _2/_3 suffixes', () => {
        // Foo.bar, Foo_bar, and Foo-bar all sanitize to Foo_bar.
        const threeWay = {
            '/a': { get: { operationId: 'Foo.bar', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
            '/b': { get: { operationId: 'Foo_bar', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
            '/c': { get: { operationId: 'Foo-bar', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
        } as any;
        const names = clientMethodNames(generateClient(threeWay, {}));
        expect(new Set(names)).toEqual(new Set(['Foo_bar', 'Foo_bar_2', 'Foo_bar_3']));
    });

    it('bumps a suffixed candidate past a real operationId that already owns it', () => {
        // Foo_bar_2 is a real operation and claims that name first; the
        // Foo.bar/Foo_bar collision pair must skip it (used-set check) rather
        // than reuse Foo_bar_2 and collide again.
        const withReal = {
            '/a': { get: { operationId: 'Foo_bar_2', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
            '/b': { get: { operationId: 'Foo.bar', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
            '/c': { get: { operationId: 'Foo_bar', tags: ['foo'], responses: { 200: { description: 'ok' } } } },
        } as any;
        const client = generateClient(withReal, {});
        const map = generateCommandMap(withReal, {});

        const names = clientMethodNames(client);
        expect(new Set(names)).toEqual(new Set(['Foo_bar_2', 'Foo_bar', 'Foo_bar_3']));

        // Cross-site sync holds across all three distinct names.
        const methodNames = new Set(names);
        const mapOpIds = [...map.matchAll(/operationId: "([^"]+)"/g)].map(m => m[1]);
        expect(new Set(mapOpIds).size).toBe(3);

        for (const opId of mapOpIds) {
            expect(methodNames.has(opId)).toBe(true);
        }
    });
});

// -- Bug 3: reserved-word group variable for untagged operations --

describe('#115 bug 3: untagged operations (reserved-word group)', () => {
    const paths = {
        '/health': {
            get: {
                operationId: 'getHealth',
                responses: { 200: { description: 'ok' } },
            },
        },
    } as any;

    it('generateCommands does not emit `const default =`', () => {
        const out = generateCommands(paths, {});
        expect(out).not.toMatch(/const default\b/);
        expectParses(out);
    });
});

// -- Bug 4: non-identifier schema property keys emitted unquoted --

describe('#115 bug 4: non-identifier property keys', () => {
    const schemas = {
        AvatarUrls: {
            type: 'object',
            properties: {
                '16x16': { type: 'string' },
                '24x24': { type: 'string' },
                'normalKey': { type: 'string' },
            },
        },
        WithInlineObject: {
            allOf: [
                {
                    type: 'object',
                    properties: {
                        '48x48': { type: 'string' },
                    },
                },
            ],
        },
        Nested: {
            type: 'object',
            properties: {
                avatars: {
                    type: 'object',
                    properties: {
                        '32x32': { type: 'string' },
                    },
                },
            },
        },
    } as any;

    it('generateTypes quotes non-identifier property keys', () => {
        const out = generateTypes(schemas);
        expect(out).toContain('"16x16"?: string;');
        expect(out).not.toMatch(/^\s*16x16\??:/m);
        expectParses(out);
    });

    it('generateTypes leaves valid identifier keys unquoted', () => {
        const out = generateTypes(schemas);
        expect(out).toMatch(/^\s*normalKey\??: string;/m);
    });
});
