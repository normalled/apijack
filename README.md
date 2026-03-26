# apijack

Jack into any OpenAPI spec and rip a full-featured CLI with AI-agentic workflow automation.

## Install

```bash
bun add apijack
```

## Quick Start

```ts
import { createCli, BasicAuthStrategy } from "apijack";

const cli = createCli({
  name: "mycli",
  description: "My API CLI",
  version: "1.0.0",
  specPath: "/v3/api-docs",
  auth: new BasicAuthStrategy(),
});

cli.run();
```

Generate your CLI from a running API:

```bash
mycli setup        # Configure URL + credentials
mycli generate     # Pull OpenAPI spec, generate types/client/commands
mycli --help       # See all generated commands
```

## Features

- **OpenAPI codegen** -- types, client, and Commander commands from any spec
- **Pluggable auth strategies** -- Basic, Bearer, API Key, or build your own
- **Multi-environment config** -- switch between dev/staging/prod with `config switch`
- **YAML routine engine** -- variables, conditions, `forEach`, assertions, sub-routines
- **Composable dispatcher** -- built-in meta-commands (`wait-until`, session refresh, sub-routines)
- **`-o routine-step` export** -- run any command with `-o routine-step` to emit YAML you can paste into workflows
- **Built-in commands** -- `setup`, `config`, `generate`, `routine run/list/validate/test`

## Auth Strategies

### Basic Auth

```ts
import { BasicAuthStrategy } from "apijack";
const auth = new BasicAuthStrategy();
```

### Bearer Token

```ts
import { BearerTokenStrategy } from "apijack";
const auth = new BearerTokenStrategy(async (config) => {
  const res = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const { access_token } = await res.json();
  return access_token;
});
```

### API Key

```ts
import { ApiKeyStrategy } from "apijack";
const auth = new ApiKeyStrategy("X-API-Key", "your-api-key");
```

### Custom

Implement the `AuthStrategy` interface:

```ts
import type { AuthStrategy, AuthSession, ResolvedAuth } from "apijack";

class MyStrategy implements AuthStrategy {
  async authenticate(config: ResolvedAuth): Promise<AuthSession> {
    return { headers: { Authorization: "Custom ..." } };
  }
  async restore(cached: AuthSession): Promise<AuthSession | null> {
    return cached;
  }
}
```

## Requirements

- [Bun](https://bun.sh) runtime

## License

MIT
