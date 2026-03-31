# Example Bun API — Petstore

A Petstore REST API built with Bun's native HTTP server and SQLite storage. Serves an OpenAPI 3.0 spec at `/v3/api-docs`. Designed for testing the `apijack` CLI framework.

## Start

```bash
bun run server.ts
# or
bun run start
```

Server runs on port 3459.

## Credentials

HTTP Basic Auth: `admin` / `password`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v3/api-docs` | OpenAPI 3.0 spec (no auth) |
| GET | `/pets` | List pets (`?species=`, `?status=`) |
| GET | `/pets/:id` | Get a pet |
| POST | `/pets` | Create a pet |
| PUT | `/pets/:id` | Update a pet |
| DELETE | `/pets/:id` | Delete a pet |
| POST | `/pets/:id/adopt` | Adopt a pet |
| GET | `/owners` | List owners |
| GET | `/owners/:id` | Get an owner (includes pets) |
| POST | `/owners` | Create an owner |
| PUT | `/owners/:id` | Update an owner |
| DELETE | `/owners/:id` | Delete an owner |
