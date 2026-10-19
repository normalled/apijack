/**
 * Pre-parse scan of the program-level options that precede the command token.
 *
 * `createCli().run()` makes several decisions before Commander parses argv
 * (first-run setup prompt, auth skip, dry-run, plugins-check guard, alias
 * rewriting, custom help). Those need the command token, which isn't argv[0]
 * when the user leads with a program option (`mycli --quiet routine list`).
 */

export interface LeadingOptionSpec {
    /** Every spelling of the option, e.g. `['-V', '--version']`. */
    flags: string[];
    /** Consumes a value: `-o json` / `-ojson`, `--opt value` / `--opt=value`. */
    takesValue: boolean;
}

export interface LeadingOption {
    /** The flag as typed, without any inline value (`-ojson` → `-o`, `--opt=v` → `--opt`). */
    flag: string;
    value?: string;
    /** The argv tokens this option occupied. */
    tokens: string[];
    /** False for an option the table doesn't list (scanned as a boolean). */
    known: boolean;
}

export interface LeadingScan {
    options: LeadingOption[];
    /** The raw tokens before the command, including a `--` terminator. */
    leading: string[];
    /** The command token onward. */
    rest: string[];
}

/**
 * The options `createCli` registers on the program. Booleans are listed even
 * when `outputModes` leaves them unregistered — scanning a boolean never
 * consumes a token, so listing it is harmless.
 */
export const PROGRAM_OPTIONS: LeadingOptionSpec[] = [
    { flags: ['--table'], takesValue: false },
    { flags: ['--quiet'], takesValue: false },
    { flags: ['-o'], takesValue: true },
    { flags: ['--dry-run'], takesValue: false },
    { flags: ['-V', '--version'], takesValue: false },
    { flags: ['-h', '--help'], takesValue: false },
];

/**
 * Walk the leading program options and split argv at the command token.
 *
 * - A `--` ends option scanning; the token after it is the command (as in Commander).
 * - A value option takes the next token as-is, or an attached value (`-ojson`, `--opt=v`).
 * - An option the table doesn't list is skipped as a boolean (`--x=v` as one token).
 */
export function scanLeadingOptions(
    args: string[],
    specs: LeadingOptionSpec[] = PROGRAM_OPTIONS,
): LeadingScan {
    const options: LeadingOption[] = [];
    let i = 0;

    while (i < args.length) {
        const arg = args[i];

        if (arg === '--') {
            i++;
            break;
        }

        if (!arg.startsWith('-') || arg === '-') break;

        const option = matchOption(arg, args[i + 1], specs);
        options.push(option);
        i += option.tokens.length;
    }

    return { options, leading: args.slice(0, i), rest: args.slice(i) };
}

function matchOption(arg: string, next: string | undefined, specs: LeadingOptionSpec[]): LeadingOption {
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const spec = specs.find(s => s.flags.includes(flag));

    if (spec) {
        if (eq > 0) return { flag, value: arg.slice(eq + 1), tokens: [arg], known: true };

        if (spec.takesValue && next !== undefined) {
            return { flag, value: next, tokens: [arg, next], known: true };
        }

        return { flag, tokens: [arg], known: true };
    }

    // Short value option with an attached value: `-ojson`.
    if (!arg.startsWith('--') && arg.length > 2) {
        const short = arg.slice(0, 2);

        if (specs.some(s => s.takesValue && s.flags.includes(short))) {
            return { flag: short, value: arg.slice(2), tokens: [arg], known: true };
        }
    }

    if (eq > 0) return { flag, value: arg.slice(eq + 1), tokens: [arg], known: false };

    return { flag, tokens: [arg], known: false };
}
