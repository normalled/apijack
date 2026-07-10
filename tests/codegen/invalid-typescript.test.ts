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
