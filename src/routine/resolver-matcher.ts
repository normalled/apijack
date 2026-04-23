export interface CallMatch {
    /** The function name including leading underscore (e.g. "_foo"). */
    name: string;
    /** Everything between the outer parens, verbatim. */
    argsStr: string;
    /** Index of the `$` in the input. */
    start: number;
    /** Index one past the closing `)`. */
    end: number;
}

function isIdentStart(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isIdentCont(c: string): boolean {
    return isIdentStart(c) || (c >= '0' && c <= '9');
}

/** Skip a JS-style string literal starting at `input[i]` (quote). Returns index past the closing quote. */
function skipString(input: string, i: number): number {
    const quote = input[i]!;
    let j = i + 1;

    while (j < input.length) {
        const c = input[j]!;

        if (c === '\\') {
            j += 2; // skip escaped char
            continue;
        }

        if (c === quote) return j + 1;

        j++;
    }

    throw new Error(`unclosed string literal starting at index ${i}`);
}

/** Scan from the position after the opening `(` until the matching `)`. Returns index of the `)`. */
function findMatchingParen(input: string, openIdx: number): number {
    let depth = 1;
    let j = openIdx + 1;

    while (j < input.length) {
        const c = input[j]!;

        if (c === '"' || c === "'") {
            j = skipString(input, j);
            continue;
        }

        if (c === '(' || c === '{' || c === '[') {
            depth++;
            j++;
            continue;
        }

        if (c === ')' || c === '}' || c === ']') {
            depth--;

            if (depth === 0) {
                if (c !== ')') {
                    throw new Error(`mismatched closing '${c}' at index ${j}; expected ')'`);
                }

                return j;
            }

            j++;
            continue;
        }

        j++;
    }

    throw new Error(`unclosed parenthesis starting near index ${openIdx - 1}`);
}

export function findFunctionCalls(input: string): CallMatch[] {
    const results: CallMatch[] = [];
    let i = 0;

    while (i < input.length) {
        if (input[i] !== '$') {
            i++;
            continue;
        }

        if (input[i + 1] !== '_' || !isIdentStart(input[i + 2] ?? '')) {
            i++;
            continue;
        }

        let nameEnd = i + 2;

        while (nameEnd < input.length && isIdentCont(input[nameEnd]!)) nameEnd++;

        if (input[nameEnd] !== '(') {
            i = nameEnd;
            continue;
        }

        const closeIdx = findMatchingParen(input, nameEnd);
        const name = input.slice(i + 1, nameEnd);
        const argsStr = input.slice(nameEnd + 1, closeIdx);
        results.push({ name, argsStr, start: i, end: closeIdx + 1 });
        i = closeIdx + 1;
    }

    return results;
}

export function isExactFunctionCall(input: string): { name: string; argsStr: string } | null {
    const trimmed = input;

    if (trimmed[0] !== '$' || trimmed[1] !== '_') return null;

    const matches = findFunctionCalls(trimmed);

    if (matches.length !== 1) return null;

    const m = matches[0]!;

    if (m.start !== 0 || m.end !== trimmed.length) return null;

    return { name: m.name, argsStr: m.argsStr };
}
