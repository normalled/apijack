import { describe, it, expect } from 'bun:test';
import { resolveResponseType } from '../../src/codegen/util';

describe('resolveResponseType', () => {
    const schemas = {
        MatterDto: { type: 'object', properties: { id: { type: 'integer' } } },
        MatterStatus: { type: 'string', enum: ['active', 'archived'] },
    } as Record<string, any>;

    it('resolves $ref response to type name', () => {
        const responses = {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MatterDto' } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('MatterDto');
    });

    it('resolves array response to TypeName[]', () => {
        const responses = {
            200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MatterDto' } } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('MatterDto[]');
    });

    it('returns void for no-body response', () => {
        const responses = {
            204: { description: 'No Content' },
        };
        expect(resolveResponseType(responses, schemas)).toBe('void');
    });

    it('prefers 200 over 201', () => {
        const responses = {
            201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MatterStatus' } } } },
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MatterDto' } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('MatterDto');
    });

    it('falls back to 201 when 200 has no body', () => {
        const responses = {
            200: { description: 'OK' },
            201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MatterDto' } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('MatterDto');
    });

    it('returns void when responses is empty', () => {
        expect(resolveResponseType({}, schemas)).toBe('void');
    });

    it('returns void when response has no JSON content', () => {
        const responses = {
            200: { content: { 'text/plain': { schema: { type: 'string' } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('void');
    });

    it('resolves inline response schema', () => {
        const responses = {
            200: { content: { 'application/json': { schema: { type: 'string' } } } },
        };
        expect(resolveResponseType(responses, schemas)).toBe('string');
    });
});
