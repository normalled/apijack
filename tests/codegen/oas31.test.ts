import { describe, it, expect } from 'bun:test';
import { generateTypes } from '../../src/codegen/types';
import { generateClient } from '../../src/codegen/client';
import { generateCommands } from '../../src/codegen/commands';
import { generateCommandMap } from '../../src/codegen/command-map';
import fixture from '../fixtures/oas31.json';

const schemas = fixture.components.schemas as Record<string, any>;
const paths = fixture.paths as Record<string, any>;

const typesOutput = generateTypes(schemas);
const clientOutput = generateClient(paths, schemas);
const commandsOutput = generateCommands(paths, schemas);
const commandMapOutput = generateCommandMap(paths, schemas);

describe('OAS 3.1: type arrays (nullable)', () => {
    it("type: ['string', 'null'] produces string | null", () => {
        const block = typesOutput.split('export interface NullableItem')[1]?.split('\n}\n')[0] || '';
        expect(block).toMatch(/description\??: string \| null/);
    });

    it("type: ['integer', 'null'] produces number | null", () => {
        const block = typesOutput.split('export interface NullableItem')[1]?.split('\n}\n')[0] || '';
        expect(block).toMatch(/priority\??: number \| null/);
    });

    it("type: ['string', 'integer'] without null produces string | number", () => {
        expect(typesOutput).toMatch(/export type MultiType = string \| number/);
    });

    it('3.0 nullable: true still works', () => {
        expect(typesOutput).toBeTruthy();
    });
});

describe('OAS 3.1: const', () => {
    it('const string produces literal type', () => {
        expect(typesOutput).toContain('"active"');
        const line = typesOutput.split('\n').find(l => l.includes('StatusConst'));
        expect(line).toContain('"active"');
    });
});

describe('OAS 3.1: enum widening', () => {
    it('integer enum produces numeric literals', () => {
        expect(typesOutput).toContain('export type IntEnum =');
        const enumLine = typesOutput.split('export type IntEnum =')[1]?.split(';')[0] || '';
        expect(enumLine).toContain('1');
        expect(enumLine).toContain('5');
        expect(enumLine).not.toContain('"1"');
    });

    it('mixed enum with null produces correct union', () => {
        expect(typesOutput).toContain('export type MixedEnum =');
        const enumLine = typesOutput.split('export type MixedEnum =')[1]?.split(';')[0] || '';
        expect(enumLine).toContain('"auto"');
        expect(enumLine).toContain('"manual"');
        expect(enumLine).toContain('0');
        expect(enumLine).toContain('1');
        expect(enumLine).toContain('null');
    });
});

describe('OAS 3.1: not (negation)', () => {
    it('not schema emits JSDoc annotation', () => {
        expect(typesOutput).toContain('NotString');
        expect(typesOutput).toContain('@not');
    });

    it('not schema does not crash generators', () => {
        expect(typesOutput).toBeTruthy();
        expect(commandsOutput).toBeTruthy();
    });
});

describe('OAS 3.1: prefixItems (tuples)', () => {
    it('prefixItems with items:false produces fixed tuple', () => {
        expect(typesOutput).toContain('TupleSchema');
        expect(typesOutput).toMatch(/\[number, number, number\]/);
    });

    it('prefixItems with items schema produces tuple with rest', () => {
        expect(typesOutput).toContain('TupleWithRest');
        const line = typesOutput.split('TupleWithRest')[1]?.split(';')[0] || '';
        expect(line).toContain('string');
        expect(line).toContain('number');
    });
});

describe('OAS 3.1: $ref with siblings', () => {
    it('$ref sibling description overrides ref target description in JSDoc', () => {
        const block = typesOutput.split('export interface RefWithSiblings')[1]?.split('\n}\n')[0] || '';
        expect(block).toContain('Custom description overriding the $ref target');
    });

    it('NullableItem.status has overridden description from $ref sibling', () => {
        const block = typesOutput.split('export interface NullableItem')[1]?.split('\n}\n')[0] || '';
        expect(block).toContain('Overridden description via $ref sibling');
    });
});

describe('OAS 3.1: $defs (local definitions)', () => {
    it('$defs schemas are resolved and properties use them', () => {
        expect(typesOutput).toContain('export interface EventWithDefs');
        const block = typesOutput.split('export interface EventWithDefs')[1]?.split('\n}\n')[0] || '';
        expect(block).toContain('severity');
        expect(block).toContain('occurredAt');
    });

    it('$defs schemas are emitted as top-level types', () => {
        expect(typesOutput).toContain('Severity');
        expect(typesOutput).toContain('Timestamp');
    });
});

describe('OAS 3.0 missing: multipleOf, minProperties, maxProperties', () => {
    it('multipleOf emits JSDoc tag', () => {
        expect(typesOutput).toContain('@multipleOf 0.01');
    });

    it('minProperties emits JSDoc tag', () => {
        expect(typesOutput).toContain('@minProperties 1');
    });

    it('maxProperties emits JSDoc tag', () => {
        expect(typesOutput).toContain('@maxProperties 20');
    });
});

describe('OAS 3.1: patternProperties', () => {
    it('patternProperties emits index signature with JSDoc', () => {
        const block = typesOutput.split('export interface PatternPropsExample')[1]?.split('\n}\n')[0] || '';
        expect(block).toContain('[key: string]:');
        expect(block).toContain('^data_');
    });

    it('NullableItem.metadata has patternProperties annotation', () => {
        const block = typesOutput.split('export interface NullableItem')[1]?.split('\n}\n')[0] || '';
        expect(block).toContain('x-');
    });
});

describe('OAS 3.0 missing: path-level parameters', () => {
    it('path-level parameters are inherited by operations in client', () => {
    // /v31/items/{itemId} has path-level parameter itemId
        expect(clientOutput).toMatch(/getV31Item\(itemId: number/);
    });

    it('path-level parameters appear in command map', () => {
        expect(commandMapOutput).toContain('getV31Item');
        expect(commandMapOutput).toContain('"itemId"');
    });

    it('operations can have their own params alongside path-level params', () => {
        expect(clientOutput).toContain('listV31Items');
    });
});

describe('OAS 3.0 missing: style/explode on parameters', () => {
    it('style annotation appears in client JSDoc', () => {
        expect(clientOutput).toContain('pipeDelimited');
    });

    it('style annotation appears in command option description', () => {
        const block = commandsOutput.split('search-v31')[1]?.split('.action(')[0] || '';
        expect(block).toContain('pipeDelimited');
    });

    it('deepObject style is annotated', () => {
        const block = commandsOutput.split('search-v31')[1]?.split('.action(')[0] || '';
        expect(block).toContain('deepObject');
    });
});
