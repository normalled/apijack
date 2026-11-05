import { describe, test, expect } from 'bun:test';
import { commandGates } from '../src/command-gates';

describe('commandGates()', () => {
    test('everything is on by default', () => {
        expect(commandGates()).toEqual({ mcpEnabled: true, pluginEnabled: true });
        expect(commandGates([])).toEqual({ mcpEnabled: true, pluginEnabled: true });
    });

    test('turning off mcp turns off plugin too', () => {
        expect(commandGates(['mcp'])).toEqual({ mcpEnabled: false, pluginEnabled: false });
    });

    test('turning off plugin leaves mcp on', () => {
        expect(commandGates(['plugin'])).toEqual({ mcpEnabled: true, pluginEnabled: false });
    });
});
