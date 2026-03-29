export interface CapturedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
}

function shellQuote(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        masked[key] = key.toLowerCase() === 'authorization' ? '****' : value;
    }
    return masked;
}

export function formatDryRun(req: CapturedRequest): string {
    const lines: string[] = [];
    lines.push(`${req.method} ${req.url}`);

    const masked = maskHeaders(req.headers);
    lines.push('Headers:');
    for (const [key, value] of Object.entries(masked)) {
        lines.push(`  ${key}: ${value}`);
    }

    if (req.body !== undefined) {
        lines.push('Body:');
        const json = JSON.stringify(req.body, null, 2);
        for (const line of json.split('\n')) {
            lines.push(`  ${line}`);
        }
    }

    return lines.join('\n');
}

export function formatCurl(
    req: CapturedRequest,
    opts: { includeCreds: boolean },
): string {
    const parts: string[] = [];

    if (req.method === 'GET') {
        parts.push(`curl ${shellQuote(req.url)}`);
    } else {
        parts.push(`curl -X ${req.method} ${shellQuote(req.url)}`);
    }

    for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() === 'authorization' && !opts.includeCreds) continue;
        parts.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
    }

    if (req.body !== undefined) {
        parts.push(`  -d ${shellQuote(JSON.stringify(req.body))}`);
    }

    return parts.join(' \\\n');
}
