import { homedir } from 'os';

/**
 * The user's home directory. Prefers `$HOME`: Bun's `os.homedir()` is fixed at
 * startup, so code using only it ignores a HOME pointed elsewhere at runtime
 * (as tests do) and reads or writes the real one.
 */
export function userHome(): string {
    return process.env.HOME || homedir();
}
