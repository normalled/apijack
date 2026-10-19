/**
 * Pre-parse scan of the program-level options that precede the command token.
 *
 * `createCli().run()` makes several decisions before Commander parses argv
 * (first-run setup prompt, auth skip, dry-run, plugins-check guard, alias
 * rewriting, custom help). Those need the command token, which isn't argv[0]
 * when the user leads with a program option (`mycli --quiet routine list`).
 * The request-preview mode needs the `-o` value from anywhere in argv
 * (`findOptionValue`).
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
    /**
     * False for an option the table doesn't list (scanned as a boolean), and
     * for a listed one used in a way Commander rejects: a boolean given
     * `--opt=value`, or a value option with no value.
     */
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
 * The options `createCli` registers on the program, plus `--config`, which it
 * takes out of argv before Commander parses (see `takeLeadingOption`). Booleans
 * are listed even when `outputModes` leaves them unregistered — scanning a
 * boolean never consumes a token, so listing it is harmless.
 */
export const PROGRAM_OPTIONS: readonly LeadingOptionSpec[] = [
    { flags: ['--table'], takesValue: false },
    { flags: ['--quiet'], takesValue: false },
    { flags: ['-o'], takesValue: true },
    { flags: ['--dry-run'], takesValue: false },
    { flags: ['-V', '--version'], takesValue: false },
    { flags: ['-h', '--help'], takesValue: false },
    { flags: ['--config'], takesValue: true },
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
    specs: readonly LeadingOptionSpec[] = PROGRAM_OPTIONS,
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

/**
 * The value of the short value option `flag` (e.g. `-o`) anywhere in argv, as
 * Commander's program-level parse reads it — `-o` is documented after the command
 * (`mycli pets list -o curl`), so a leading-only scan isn't enough.
 *
 * - A `--` ends scanning; past it, `-ocurl` is an operand.
 * - The option takes the next token as-is, or an attached value (`-ocurl`).
 * - Every other token is skipped on its own, so `--name -ocurl` still yields
 *   `curl`, as it does in Commander.
 * - The last occurrence wins.
 * - `-o=curl` is read as `curl` (see `stripShortOptionEquals`).
 * - Combined short flags (`-vocurl`) aren't split, since which letters are
 *   booleans depends on options registered later; `createCli` fails such a
 *   preview in a `preAction` hook instead of sending the request.
 */
export function findOptionValue(args: string[], flag: string): string | undefined {
    const specs: LeadingOptionSpec[] = [{ flags: [flag], takesValue: true }];
    let value: string | undefined;
    let i = 0;

    while (i < args.length && args[i] !== '--') {
        const option = matchOption(args[i], args[i + 1], specs);

        if (option.known && option.value !== undefined) {
            value = stripShortOptionEquals(option.value);
            i += option.tokens.length;
        } else {
            i++;
        }
    }

    return value;
}

/**
 * Commander splits `--opt=value` but not a short option's `-o=value`, which
 * it reads as the value `=value`. Take it as `value`, like `-o value`.
 */
export function stripShortOptionEquals(value: string): string {
    return value.startsWith('=') ? value.slice(1) : value;
}

function matchOption(arg: string, next: string | undefined, specs: readonly LeadingOptionSpec[]): LeadingOption {
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const spec = specs.find(s => s.flags.includes(flag));

    if (spec) {
        if (eq > 0) return { flag, value: arg.slice(eq + 1), tokens: [arg], known: spec.takesValue };

        if (spec.takesValue) {
            if (next === undefined) return { flag, tokens: [arg], known: false };

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

/**
 * Remove every occurrence of `flag` from the leading program options and return
 * the last value given. Tokens from the command on — including a command's own
 * option of the same name — are left alone.
 */
export function takeLeadingOption(
    args: string[],
    flag: string,
    specs: readonly LeadingOptionSpec[] = PROGRAM_OPTIONS,
): { found: boolean; value?: string; args: string[] } {
    const { options, leading, rest } = scanLeadingOptions(args, specs);
    const taken = options.filter(o => o.flag === flag);

    if (taken.length === 0) return { found: false, args };

    const kept = options.filter(o => o.flag !== flag).flatMap(o => o.tokens);
    // A `--` terminator is the only leading token no option consumed.
    const terminator = leading.slice(options.reduce((n, o) => n + o.tokens.length, 0));

    return { found: true, value: taken[taken.length - 1].value, args: [...kept, ...terminator, ...rest] };
}
