import { describe, expect, it } from 'bun:test';
import { generateTypes } from '../../src/codegen/types';
import type { OpenApiSchema } from '../../src/codegen/openapi-types';
import fixture from '../fixtures/petstore.json';

describe('generateTypes — unit tests', () => {
    it('generates a simple interface with properties', () => {
        const schemas: Record<string, OpenApiSchema> = {
            User: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                    active: { type: 'boolean' },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export interface User {');
        expect(output).toContain('  name?: string;');
        expect(output).toContain('  age?: number;');
        expect(output).toContain('  active?: boolean;');
        expect(output).toContain('}');
    });

    it('generates an enum as a union type', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Status: {
                enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain(
            'export type Status = "ACTIVE" | "INACTIVE" | "PENDING";',
        );
    });

    it('generates allOf as intersection type', () => {
        const schemas: Record<string, OpenApiSchema> = {
            AdminUser: {
                allOf: [
                    { $ref: '#/components/schemas/User' },
                    { $ref: '#/components/schemas/AdminRole' },
                ],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export type AdminUser = User & AdminRole;');
    });

    it('generates oneOf as union type', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Shape: {
                oneOf: [
                    { $ref: '#/components/schemas/Circle' },
                    { $ref: '#/components/schemas/Square' },
                ],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export type Shape = Circle | Square;');
    });

    it('generates anyOf as union type', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Input: {
                anyOf: [
                    { $ref: '#/components/schemas/TextInput' },
                    { $ref: '#/components/schemas/NumberInput' },
                ],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export type Input = TextInput | NumberInput;');
    });

    it('handles $ref properties', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Order: {
                type: 'object',
                properties: {
                    item: { $ref: '#/components/schemas/Product' },
                    tags: { type: 'array', items: { type: 'string' } },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('  item?: Product;');
        expect(output).toContain('  tags?: string[];');
    });

    it('handles nullable properties', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Profile: {
                type: 'object',
                properties: {
                    bio: { type: 'string', nullable: true },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('  bio?: string | null;');
    });

    it('includes auto-generated header', () => {
        const output = generateTypes({});
        expect(output).toContain('// Auto-generated');
    });

    it('generates multiple schemas', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Foo: {
                type: 'object',
                properties: {
                    x: { type: 'string' },
                },
            },
            Bar: {
                enum: ['A', 'B'],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export interface Foo {');
        expect(output).toContain('export type Bar = "A" | "B";');
    });

    it('handles schema with properties but no explicit type', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Implicit: {
                properties: {
                    value: { type: 'number' },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export interface Implicit {');
        expect(output).toContain('  value?: number;');
    });

    it('allOf with inline schema emits inline intersection member', () => {
        const schemas: Record<string, OpenApiSchema> = {
            Mixed: {
                allOf: [
                    { $ref: '#/components/schemas/Base' },
                    { type: 'object', properties: { extra: { type: 'string' } } },
                ],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export type Mixed = Base &');
        expect(output).toContain('extra');
    });

    it('sanitizes dot-notation schema names in interface declarations', () => {
        const schemas: Record<string, OpenApiSchema> = {
            'billing.alert': {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    status: { type: 'string' },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export interface billing__alert {');
        expect(output).not.toContain('export interface billing.alert {');
    });

    it('sanitizes dot-notation schema names in type alias declarations', () => {
        const schemas: Record<string, OpenApiSchema> = {
            'account.updated': {
                anyOf: [
                    { $ref: '#/components/schemas/account' },
                    { $ref: '#/components/schemas/event' },
                ],
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export type account__updated = ');
        expect(output).not.toContain('export type account.updated = ');
    });

    it('sanitizes dot-notation in $ref references within properties', () => {
        const schemas: Record<string, OpenApiSchema> = {
            'apps.secret': {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            },
            'Container': {
                type: 'object',
                properties: {
                    secret: { $ref: '#/components/schemas/apps.secret' },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('secret?: apps__secret;');
        expect(output).not.toContain('secret?: apps.secret;');
    });

    it('sanitizes multi-dot schema names', () => {
        const schemas: Record<string, OpenApiSchema> = {
            'account.application.authorized': {
                type: 'object',
                properties: {
                    object: { $ref: '#/components/schemas/application' },
                },
            },
        };
        const output = generateTypes(schemas);
        expect(output).toContain('export interface account__application__authorized {');
    });
});

describe('generateTypes — petstore fixture', () => {
    const schemas = fixture.components.schemas as Record<string, any>;
    const output = generateTypes(schemas);

    it('generates interface for object schema', () => {
        expect(output).toContain('export interface MatterDto {');
        expect(output).toContain('id?: number;');
        expect(output).toContain('name?: string;');
    });

    it('generates enum as union type', () => {
        expect(output).toContain('export type MatterStatus = "active" | "archived" | "deleted";');
    });

    it('resolves $ref to type name', () => {
        expect(output).toContain('status?: MatterStatus;');
    });

    it('generates array type', () => {
        expect(output).toContain('users?: UserDto[];');
    });

    it('handles nullable fields', () => {
        expect(output).toContain('description?: string | null;');
    });

    it('generates allOf as intersection type', () => {
        expect(output).toContain('export type MatterWithUsers = MatterDto & UserDto;');
    });

    it('generates oneOf as union type', () => {
        expect(output).toContain('export type SearchResult = MatterDto | UserDto;');
    });

    // Enum reuse
    it('enum $ref resolves to type name, not inline values', () => {
        expect(output).toMatch(/status\??: MatterStatus/);
        const describedBlock = output.split('export interface DescribedDto')[1]?.split('\n}')[0] || '';
        expect(describedBlock).not.toContain('"active"');
    });

    // Inline object types
    it('inline object properties emit object literal type instead of Record', () => {
        expect(output).toContain('config?:');
        expect(output).not.toMatch(/config\??: Record<string, unknown>/);
        const describedBlock = output.split('export interface DescribedDto')[1]?.split('\n}\n')[0] || '';
        expect(describedBlock).toContain('enabled');
        expect(describedBlock).toContain('threshold');
    });

    // allOf with inline schema
    it('allOf with inline schema emits inline intersection member', () => {
        expect(output).toContain('export type ExtendedMatter = MatterDto &');
        expect(output).toContain('priority');
        expect(output).toContain('notes');
        expect(output).not.toMatch(/ExtendedMatter = MatterDto & unknown/);
    });

    // Discriminated unions
    it('oneOf with discriminator emits discriminated union', () => {
        expect(output).toContain('EmailNotification & { channel: "email" }');
        expect(output).toContain('SmsNotification & { channel: "sms" }');
    });

    // additionalProperties
    it('additionalProperties with schema emits index signature', () => {
        expect(output).toContain('[key: string]:');
    });

    // Required properties
    it('required properties omit the ? marker', () => {
        const describedBlock = output.split('export interface DescribedDto')[1]?.split('\n}\n')[0] || '';
        expect(describedBlock).toMatch(/\bname: string/);
        expect(describedBlock).toMatch(/\bemail: string/);
        expect(describedBlock).toMatch(/\bscore\?: number/);
    });

    it('allOf merges required arrays', () => {
        expect(output).toMatch(/priority: number/);
    });

    // JSDoc
    it('schema description emits JSDoc above interface', () => {
        expect(output).toContain('/** A well-described DTO for testing JSDoc generation */');
    });

    it('property description emits JSDoc above property', () => {
        expect(output).toContain('/** Server-assigned unique identifier');
    });

    it('property with format emits @format tag', () => {
        expect(output).toContain('@format date-time');
    });

    it('property with constraints emits constraint tags', () => {
        expect(output).toContain('@minimum 0');
        expect(output).toContain('@maximum 100');
        expect(output).toContain('@minLength 1');
        expect(output).toContain('@maxLength 255');
    });

    it('property with default emits @default tag', () => {
        expect(output).toContain('@default 50');
    });

    it('property with example emits @example tag', () => {
        expect(output).toContain('@example "XY9876"');
    });

    it('property with pattern emits @pattern tag', () => {
        expect(output).toContain('@pattern ^[A-Z]{2}\\d{4}$');
    });

    it('readOnly property emits @readonly tag', () => {
        expect(output).toContain('@readonly');
    });

    it('writeOnly property emits @writeonly tag', () => {
        expect(output).toContain('@writeonly');
    });

    it('deprecated property emits @deprecated tag', () => {
        const describedBlock = output.split('export interface DescribedDto')[1]?.split('\n}\n')[0] || '';
        expect(describedBlock).toContain('@deprecated');
    });

    it('deprecated schema emits @deprecated JSDoc', () => {
        expect(output).toContain('/** @deprecated Use DescribedDto instead */');
    });

    it('array constraints emit @minItems and @maxItems', () => {
        expect(output).toContain('@minItems 0');
        expect(output).toContain('@maxItems 10');
    });
});
