export const name = '_uppercase';

export default function uppercase(argsStr?: string): string {
    return (argsStr ?? '').toUpperCase();
}
