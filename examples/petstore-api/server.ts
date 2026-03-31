// Petstore example API — Bun native HTTP server with SQLite
// Used for testing the apijack CLI framework

import { Database } from "bun:sqlite";

// ── Database setup ─────────────────────────────────────────────────────────

const db = new Database(":memory:");
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )
`);

db.run(`
  CREATE TABLE pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    age INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL
  )
`);

// ── Seed data ──────────────────────────────────────────────────────────────

db.run(`INSERT INTO owners (name, email) VALUES ('Alice Johnson', 'alice@example.com')`);
db.run(`INSERT INTO owners (name, email) VALUES ('Bob Smith', 'bob@example.com')`);

db.run(`INSERT INTO pets (name, species, age, status, owner_id) VALUES ('Buddy', 'dog', 3, 'adopted', 1)`);
db.run(`INSERT INTO pets (name, species, age, status) VALUES ('Whiskers', 'cat', 2, 'available')`);
db.run(`INSERT INTO pets (name, species, age, status) VALUES ('Goldie', 'fish', 1, 'available')`);
db.run(`INSERT INTO pets (name, species, age, status, owner_id) VALUES ('Rex', 'dog', 5, 'adopted', 2)`);
db.run(`INSERT INTO pets (name, species, age, status) VALUES ('Luna', 'cat', 1, 'pending')`);

// ── Auth ────────────────────────────────────────────────────────────────────

const VALID_USER = "admin";
const VALID_PASS = "password";

function checkAuth(req: Request): Response | null {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Petstore API"' },
    });
  }
  const decoded = atob(auth.slice(6));
  const [user, pass] = decoded.split(":");
  if (user !== VALID_USER || pass !== VALID_PASS) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  return null; // auth OK
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function formatPet(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    age: row.age,
    status: row.status,
    ownerId: row.owner_id ?? null,
  };
}

function formatOwner(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  };
}

// ── Route handling ──────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // OpenAPI spec — no auth required
  if (method === "GET" && path === "/v3/api-docs") {
    return json(openapiSpec);
  }

  // All other routes require auth
  const authError = checkAuth(req);
  if (authError) return authError;

  // ── Pets ────────────────────────────────────────────────────────────────

  // GET /pets
  if (method === "GET" && path === "/pets") {
    const species = url.searchParams.get("species");
    const status = url.searchParams.get("status");
    let query = "SELECT * FROM pets WHERE 1=1";
    const params: string[] = [];
    if (species) {
      query += " AND species = ?";
      params.push(species);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    const rows = db.query(query).all(...params) as Record<string, unknown>[];
    return json(rows.map(formatPet));
  }

  // POST /pets
  if (method === "POST" && path === "/pets") {
    const body = await req.json() as Record<string, unknown>;
    if (!body.name || typeof body.name !== "string") {
      return json({ error: "name is required" }, 400);
    }
    if (!body.species || typeof body.species !== "string") {
      return json({ error: "species is required" }, 400);
    }
    if (body.age === undefined || typeof body.age !== "number") {
      return json({ error: "age is required" }, 400);
    }
    const result = db.query(
      "INSERT INTO pets (name, species, age) VALUES (?, ?, ?) RETURNING *"
    ).get(body.name, body.species, body.age) as Record<string, unknown>;
    return json(formatPet(result), 201);
  }

  // POST /pets/:id/adopt
  const petAdoptMatch = path.match(/^\/pets\/(\d+)\/adopt$/);
  if (method === "POST" && petAdoptMatch) {
    const id = parseId(petAdoptMatch[1]);
    const pet = db.query("SELECT * FROM pets WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!pet) return json({ error: "Pet not found" }, 404);
    const body = await req.json() as Record<string, unknown>;
    if (!body.ownerId || typeof body.ownerId !== "number") {
      return json({ error: "ownerId is required" }, 400);
    }
    const owner = db.query("SELECT * FROM owners WHERE id = ?").get(body.ownerId);
    if (!owner) return json({ error: "Owner not found" }, 404);
    const updated = db.query(
      "UPDATE pets SET status = 'adopted', owner_id = ? WHERE id = ? RETURNING *"
    ).get(body.ownerId, id) as Record<string, unknown>;
    return json(formatPet(updated));
  }

  // GET /pets/:id
  const petGetMatch = path.match(/^\/pets\/(\d+)$/);
  if (method === "GET" && petGetMatch) {
    const id = parseId(petGetMatch[1]);
    const pet = db.query("SELECT * FROM pets WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!pet) return json({ error: "Pet not found" }, 404);
    return json(formatPet(pet));
  }

  // PUT /pets/:id
  const petPutMatch = path.match(/^\/pets\/(\d+)$/);
  if (method === "PUT" && petPutMatch) {
    const id = parseId(petPutMatch[1]);
    const pet = db.query("SELECT * FROM pets WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!pet) return json({ error: "Pet not found" }, 404);
    const body = await req.json() as Record<string, unknown>;
    if (body.name !== undefined) pet.name = body.name;
    if (body.species !== undefined) pet.species = body.species;
    if (body.age !== undefined) pet.age = body.age;
    if (body.status !== undefined) pet.status = body.status;
    const updated = db.query(
      "UPDATE pets SET name = ?, species = ?, age = ?, status = ? WHERE id = ? RETURNING *"
    ).get(pet.name as string, pet.species as string, pet.age as number, pet.status as string, id) as Record<string, unknown>;
    return json(formatPet(updated));
  }

  // DELETE /pets/:id
  const petDeleteMatch = path.match(/^\/pets\/(\d+)$/);
  if (method === "DELETE" && petDeleteMatch) {
    const id = parseId(petDeleteMatch[1]);
    const pet = db.query("SELECT * FROM pets WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!pet) return json({ error: "Pet not found" }, 404);
    db.query("DELETE FROM pets WHERE id = ?").run(id);
    return json(formatPet(pet));
  }

  // ── Owners ──────────────────────────────────────────────────────────────

  // GET /owners
  if (method === "GET" && path === "/owners") {
    const rows = db.query("SELECT * FROM owners").all() as Record<string, unknown>[];
    return json(rows.map(formatOwner));
  }

  // POST /owners
  if (method === "POST" && path === "/owners") {
    const body = await req.json() as Record<string, unknown>;
    if (!body.name || typeof body.name !== "string") {
      return json({ error: "name is required" }, 400);
    }
    if (!body.email || typeof body.email !== "string") {
      return json({ error: "email is required" }, 400);
    }
    try {
      const result = db.query(
        "INSERT INTO owners (name, email) VALUES (?, ?) RETURNING *"
      ).get(body.name, body.email) as Record<string, unknown>;
      return json(formatOwner(result), 201);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("UNIQUE")) {
        return json({ error: "Email already exists" }, 400);
      }
      throw e;
    }
  }

  // GET /owners/:id
  const ownerGetMatch = path.match(/^\/owners\/(\d+)$/);
  if (method === "GET" && ownerGetMatch) {
    const id = parseId(ownerGetMatch[1]);
    const owner = db.query("SELECT * FROM owners WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!owner) return json({ error: "Owner not found" }, 404);
    const pets = db.query("SELECT * FROM pets WHERE owner_id = ?").all(id) as Record<string, unknown>[];
    return json({
      ...formatOwner(owner),
      pets: pets.map(formatPet),
    });
  }

  // PUT /owners/:id
  const ownerPutMatch = path.match(/^\/owners\/(\d+)$/);
  if (method === "PUT" && ownerPutMatch) {
    const id = parseId(ownerPutMatch[1]);
    const owner = db.query("SELECT * FROM owners WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!owner) return json({ error: "Owner not found" }, 404);
    const body = await req.json() as Record<string, unknown>;
    if (body.name !== undefined) owner.name = body.name;
    if (body.email !== undefined) owner.email = body.email;
    try {
      const updated = db.query(
        "UPDATE owners SET name = ?, email = ? WHERE id = ? RETURNING *"
      ).get(owner.name as string, owner.email as string, id) as Record<string, unknown>;
      return json(formatOwner(updated));
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("UNIQUE")) {
        return json({ error: "Email already exists" }, 400);
      }
      throw e;
    }
  }

  // DELETE /owners/:id
  const ownerDeleteMatch = path.match(/^\/owners\/(\d+)$/);
  if (method === "DELETE" && ownerDeleteMatch) {
    const id = parseId(ownerDeleteMatch[1]);
    const owner = db.query("SELECT * FROM owners WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!owner) return json({ error: "Owner not found" }, 404);
    db.query("DELETE FROM owners WHERE id = ?").run(id);
    return json(formatOwner(owner));
  }

  // ── 404 ─────────────────────────────────────────────────────────────────

  return json({ error: "Not found" }, 404);
}

// ── OpenAPI 3.0 spec ────────────────────────────────────────────────────────

const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Petstore API",
    description: "A petstore API with SQLite storage for testing apijack CLI generation",
    version: "1.0.0",
  },
  servers: [{ url: "http://localhost:3459", description: "Local dev" }],
  security: [{ basicAuth: [] }],
  tags: [
    { name: "pets", description: "Pet operations" },
    { name: "owners", description: "Owner operations" },
  ],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["pets"],
        parameters: [
          {
            name: "species",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["dog", "cat", "bird", "fish", "rabbit"] },
            description: "Filter pets by species",
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["available", "pending", "adopted"] },
            description: "Filter pets by status",
          },
        ],
        responses: {
          "200": {
            description: "List of pets",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createPet",
        summary: "Create a new pet",
        tags: ["pets"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePet" },
            },
          },
        },
        responses: {
          "201": {
            description: "Pet created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/pets/{id}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet by ID",
        tags: ["pets"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pet ID",
          },
        ],
        responses: {
          "200": {
            description: "Pet details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Pet not found" },
        },
      },
      put: {
        operationId: "updatePet",
        summary: "Update a pet",
        tags: ["pets"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pet ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePet" },
            },
          },
        },
        responses: {
          "200": {
            description: "Pet updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Pet not found" },
        },
      },
      delete: {
        operationId: "deletePet",
        summary: "Delete a pet",
        tags: ["pets"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pet ID",
          },
        ],
        responses: {
          "200": {
            description: "Deleted pet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Pet not found" },
        },
      },
    },
    "/pets/{id}/adopt": {
      post: {
        operationId: "adoptPet",
        summary: "Adopt a pet",
        tags: ["pets"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pet ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdoptRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Pet adopted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
          "404": { description: "Pet not found" },
        },
      },
    },
    "/owners": {
      get: {
        operationId: "listOwners",
        summary: "List all owners",
        tags: ["owners"],
        responses: {
          "200": {
            description: "List of owners",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Owner" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createOwner",
        summary: "Create a new owner",
        tags: ["owners"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOwner" },
            },
          },
        },
        responses: {
          "201": {
            description: "Owner created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Owner" },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/owners/{id}": {
      get: {
        operationId: "getOwner",
        summary: "Get an owner by ID",
        tags: ["owners"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Owner ID",
          },
        ],
        responses: {
          "200": {
            description: "Owner details with pets",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OwnerWithPets" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Owner not found" },
        },
      },
      put: {
        operationId: "updateOwner",
        summary: "Update an owner",
        tags: ["owners"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Owner ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateOwner" },
            },
          },
        },
        responses: {
          "200": {
            description: "Owner updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Owner" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Owner not found" },
        },
      },
      delete: {
        operationId: "deleteOwner",
        summary: "Delete an owner",
        tags: ["owners"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Owner ID",
          },
        ],
        responses: {
          "200": {
            description: "Deleted owner",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Owner" },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Owner not found" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
      },
    },
    schemas: {
      Pet: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Buddy" },
          species: {
            type: "string",
            enum: ["dog", "cat", "bird", "fish", "rabbit"],
            example: "dog",
          },
          age: { type: "integer", example: 3 },
          status: {
            type: "string",
            enum: ["available", "pending", "adopted"],
            example: "available",
          },
          ownerId: {
            type: "integer",
            nullable: true,
            example: 1,
          },
        },
        required: ["id", "name", "species", "age", "status", "ownerId"],
      },
      CreatePet: {
        type: "object",
        properties: {
          name: { type: "string", example: "Buddy" },
          species: {
            type: "string",
            enum: ["dog", "cat", "bird", "fish", "rabbit"],
            example: "dog",
          },
          age: { type: "integer", example: 3 },
        },
        required: ["name", "species", "age"],
      },
      UpdatePet: {
        type: "object",
        properties: {
          name: { type: "string", example: "Buddy" },
          species: {
            type: "string",
            enum: ["dog", "cat", "bird", "fish", "rabbit"],
          },
          age: { type: "integer", example: 3 },
          status: {
            type: "string",
            enum: ["available", "pending", "adopted"],
          },
        },
      },
      Owner: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Alice Johnson" },
          email: { type: "string", example: "alice@example.com" },
        },
        required: ["id", "name", "email"],
      },
      OwnerWithPets: {
        allOf: [
          { $ref: "#/components/schemas/Owner" },
          {
            type: "object",
            properties: {
              pets: {
                type: "array",
                items: { $ref: "#/components/schemas/Pet" },
              },
            },
            required: ["pets"],
          },
        ],
      },
      CreateOwner: {
        type: "object",
        properties: {
          name: { type: "string", example: "Alice Johnson" },
          email: { type: "string", example: "alice@example.com" },
        },
        required: ["name", "email"],
      },
      UpdateOwner: {
        type: "object",
        properties: {
          name: { type: "string", example: "Alice Johnson" },
          email: { type: "string", example: "alice@example.com" },
        },
      },
      AdoptRequest: {
        type: "object",
        properties: {
          ownerId: { type: "integer", example: 1 },
        },
        required: ["ownerId"],
      },
    },
  },
};

// ── Start server ────────────────────────────────────────────────────────────

const PORT = 3459;

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`Petstore API running on http://localhost:${PORT}`);
console.log(`OpenAPI spec: http://localhost:${PORT}/v3/api-docs`);
console.log(`Auth: admin / password`);
