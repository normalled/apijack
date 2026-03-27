# Edge Cases Content Platform API

A deliberately tricky REST API designed to stress-test OpenAPI codegen tools. Runs on Bun at port 3458 with basic auth (`admin:password`).

## Quick Start

```bash
bun run start
# or
bun run server.ts
```

OpenAPI spec: `GET http://localhost:3458/v3/api-docs` (no auth required)

## Edge Cases Tested

### 1. Templated/paginated responses (Page\<T\> pattern)
Three separate `PageOfX` schemas that share the same structural pattern but wrap different content types:
- `PageOfPosts` (content: Post[])
- `PageOfComments` (content: Comment[])
- `PageOfUsers` (content: BaseUser[])

Each has `content`, `page`, `size`, `totalElements`, `totalPages`, `last`.

### 2. Discriminated unions (polymorphism)
`ContentItem` uses `oneOf` + `discriminator` with three variants:
- `TextPost` (body, wordCount)
- `ImagePost` (imageUrl, width, height, format)
- `VideoPost` (videoUrl, duration, resolution)

All share a `ContentItemBase` via `allOf` (id, title, createdAt). Discriminator property: `type`.

### 3. Deep allOf composition
`AdminUser` = `allOf[BaseUser, AdminPermissions, {department}]` -- three-way composition mixing two named schemas with an inline object.

### 4. Poorly-defined / overly optional spec
- `POST /media/upload`: ALL properties optional, vague descriptions ("data", "options", "meta")
- `GET /search`: 12 query params with cryptic single-letter names (`q`, `t`, `f`, `s`, `o`, `p`, `ps`, `df`, `dt`, `x`, `cat`, `lang`)
- `SearchResult` / `SearchResultItem`: most fields nullable and optional

### 5. Conflicting/duplicate tag names
- `"Content : Posts"` -- colon + space
- `"Content : Comments"` -- same prefix, different suffix
- `"Admin/Users"` -- slash separator
- `"admin : settings"` -- lowercase + colon, visually similar to "Admin/Users"

### 6. Multiple endpoints with same HTTP method under one tag
Under `"Content : Posts"`:
- `POST /posts` (createPost)
- `POST /posts/bulk` (bulkCreatePosts)
- `POST /content` (createContent)
- `POST /posts/{id}/publish` (publishPost)

Tests verb deduplication and operationId fallback.

### 7. Primitive body types
- `PUT /settings/theme`: body is `{ type: "string" }` with enum -- raw string, not an object
- `PUT /settings/notifications`: body is `{ type: "array", items: { type: "string" } }` -- array of strings with minItems/maxItems

### 8. Deeply nested $ref chains
`PostWithAuthorAndComments` -> allOf with `Post` -> author is `BaseUser` -> has `Address` -> has `Coordinates`. Comments array contains `CommentWithAuthor` -> allOf with `Comment` + `BaseUser` (which again chains to Address -> Coordinates).

### 9. Enums everywhere
Status enums (4 values each), role enums, content type enums, sort order enums, priority enums, category enums, image format enums, video resolution enums, notification channel enums, theme enums, constraint type enums, error code enums.

### 10. Empty/minimal endpoints
- `DELETE /cache` -- no params, no body, 204 no content
- `HEAD /health` -- no params, no body, no auth, no response body

### 11. Different response codes with different schemas
- `POST /posts` returns 201 with `PostWithAuthorAndComments`, while `GET /posts` returns 200 with `PageOfPosts`
- `POST /posts/{id}/publish` returns 200 with inline schema `{ published: boolean, publishedAt: string }`
- `PUT /posts/{id}` returns 200 with `Post` or 204 with no body
- Error responses: 400 uses `ValidationError`, 404 uses `ErrorResponse`, 409 uses `ConflictError` -- all different shapes

### 12. Response headers
- `GET /posts` documents `X-Total-Count`, `X-Page`, `X-Page-Size` response headers
- `POST /posts` documents `Location` header in 201 response

### 13. Additional OpenAPI features

| Feature | Where |
|---------|-------|
| `deprecated: true` | `GET /posts/search` (deprecated in favor of `GET /search`) |
| `readOnly` properties | `id`, `slug`, `createdAt`, `updatedAt`, `status` on various models |
| `writeOnly` properties | `password` on `BaseUser` and `CreateUser` |
| `minLength`/`maxLength` | `username` (3-50), `title` (1-300), `body` (max 50000), `state` (2-2) |
| `minimum`/`maximum` | `lat` (-90 to 90), `lng` (-180 to 180), image dimensions (1-10000), `ttl` (0-86400) |
| `pattern` | `state` (`^[A-Z]{2}$`), `zip` (`^\d{5}(-\d{4})?$`), `username` (`^[a-zA-Z0-9_-]+$`), `slug`, `lang` |
| `default` values | `page` (0), `size` (20), `status` ("draft"), `role` ("viewer"), `country` ("US"), `overwrite` (false) |
| `example` values | On nearly every schema property |
| `nullable: true` | SearchResult fields, MediaUploadRequest fields, metadata, ConflictError.existingId |
| `additionalProperties: true` | `metadata` on Post, `options`/`meta` on MediaUploadRequest, `filters`/`facets` on SearchResult |
| `format` variety | `date-time`, `email`, `uri`, `password`, `int32`, `int64`, `float`, `double`, `date`, `binary` |
| `multipart/form-data` | `POST /media/upload` accepts both JSON and multipart with file upload |
| Multiple content types | `POST /users` accepts both `application/json` and `application/x-www-form-urlencoded` |
| Required vs optional mix | `CreatePost` has required `title`/`body` but optional everything else |
| `minItems`/`maxItems` | Bulk create (1-100), tags (0-20), notifications (1-10), media tags (max 50) |
| `externalDocs` | On `GET /search` and `GET /posts/search`, plus top-level |
| Security override | `HEAD /health` has `security: []` (no auth required) |

## Endpoints

| Method | Path | Tag | Notes |
|--------|------|-----|-------|
| GET | /posts | Content : Posts | PageOfPosts, response headers |
| POST | /posts | Content : Posts | CreatePost (allOf), returns PostWithAuthorAndComments, Location header |
| GET | /posts/:id | Content : Posts | PostWithAuthorAndComments (deep nesting) |
| PUT | /posts/:id | Content : Posts | UpdatePost, can return 200 or 204 |
| POST | /posts/:id/publish | Content : Posts | Inline response schema, 409 ConflictError |
| GET | /posts/search | Content : Posts | DEPRECATED |
| POST | /posts/bulk | Content : Posts | Array body, verb dedup test |
| GET | /comments | Content : Comments | PageOfComments |
| POST | /comments | Content : Comments | CreateComment |
| GET | /content | Content : Posts | ContentItem[] (discriminated union) |
| POST | /content | Content : Posts | ContentItem input (discriminated union) |
| GET | /users | Admin/Users | PageOfUsers |
| POST | /users | Admin/Users | JSON + form-urlencoded |
| GET | /admin/users | admin : settings | AdminUser[] (deep allOf) |
| GET | /search | Search | 12 poorly-named query params |
| POST | /media/upload | Media | All-optional, JSON + multipart |
| GET | /settings/theme | admin : settings | ThemeResponse |
| PUT | /settings/theme | admin : settings | Raw string body |
| GET | /settings/notifications | admin : settings | NotificationResponse |
| PUT | /settings/notifications | admin : settings | Array of strings body |
| DELETE | /cache | System | Empty endpoint, 204 |
| HEAD | /health | System | Empty endpoint, no auth |
