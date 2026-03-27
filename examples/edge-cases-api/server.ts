// Edge Cases Content Platform API — stress-tests OpenAPI codegen
// Bun native HTTP server on port 3458
// Tests: Page<T>, discriminated unions, deep allOf, poorly-defined params,
//        conflicting tags, verb dedup, primitive bodies, deep $ref chains,
//        enums everywhere, empty endpoints, readOnly/writeOnly, deprecated endpoints,
//        response headers, multiple content types, multipart/form-data, validators

// ── Data types ────────────────────────────────────────────────────────────────

interface Coordinates {
  lat: number;
  lng: number;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  coordinates: Coordinates;
}

interface BaseUser {
  id: number;
  username: string;
  email: string;
  role: "viewer" | "editor" | "admin" | "superadmin";
  status: "active" | "inactive" | "suspended" | "pending";
  address: Address;
  createdAt: string;
}

interface AdminPermissions {
  canManageUsers: boolean;
  canManageContent: boolean;
  canManageSettings: boolean;
  canViewAnalytics: boolean;
  permissionLevel: "read" | "write" | "admin" | "superadmin";
}

interface AdminUser extends BaseUser, AdminPermissions {
  department: string;
}

interface Post {
  id: number;
  title: string;
  body: string;
  slug: string;
  authorId: number;
  status: "draft" | "published" | "archived" | "flagged";
  category: "tech" | "science" | "culture" | "politics" | "sports" | "other";
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: number;
  postId: number;
  authorId: number;
  body: string;
  status: "visible" | "hidden" | "flagged" | "deleted";
  createdAt: string;
}

interface PostWithAuthorAndComments extends Post {
  author: BaseUser;
  comments: (Comment & { author: BaseUser })[];
}

type ContentItem =
  | { type: "text"; id: number; title: string; createdAt: string; body: string; wordCount: number }
  | { type: "image"; id: number; title: string; createdAt: string; imageUrl: string; width: number; height: number; format: "png" | "jpg" | "gif" | "webp" }
  | { type: "video"; id: number; title: string; createdAt: string; videoUrl: string; duration: number; resolution: "480p" | "720p" | "1080p" | "4k" };

// ── In-memory storage with seed data ──────────────────────────────────────────

const coords1: Coordinates = { lat: 40.7128, lng: -74.006 };
const coords2: Coordinates = { lat: 34.0522, lng: -118.2437 };
const coords3: Coordinates = { lat: 41.8781, lng: -87.6298 };

const addr1: Address = { street: "123 Main St", city: "New York", state: "NY", zip: "10001", country: "US", coordinates: coords1 };
const addr2: Address = { street: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001", country: "US", coordinates: coords2 };
const addr3: Address = { street: "789 Elm Blvd", city: "Chicago", state: "IL", zip: "60601", country: "US", coordinates: coords3 };

let nextUserId = 4;
let nextPostId = 4;
let nextCommentId = 5;
let nextContentId = 4;

const users: BaseUser[] = [
  { id: 1, username: "alice", email: "alice@example.com", role: "admin", status: "active", address: addr1, createdAt: "2025-01-10T08:00:00Z" },
  { id: 2, username: "bob", email: "bob@example.com", role: "editor", status: "active", address: addr2, createdAt: "2025-02-15T10:30:00Z" },
  { id: 3, username: "carol", email: "carol@example.com", role: "viewer", status: "inactive", address: addr3, createdAt: "2025-03-20T14:00:00Z" },
];

const adminUsers: AdminUser[] = [
  {
    ...users[0], canManageUsers: true, canManageContent: true, canManageSettings: true,
    canViewAnalytics: true, permissionLevel: "superadmin", department: "Engineering",
  },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const posts: Post[] = [
  { id: 1, title: "Getting Started with Bun", body: "Bun is a fast JavaScript runtime...", slug: "getting-started-with-bun", authorId: 1, status: "published", category: "tech", priority: "normal", tags: ["bun", "javascript"], metadata: { featured: true }, createdAt: "2025-06-01T09:00:00Z", updatedAt: "2025-06-01T09:00:00Z" },
  { id: 2, title: "The Future of AI", body: "Artificial intelligence continues to evolve...", slug: "the-future-of-ai", authorId: 2, status: "published", category: "science", priority: "high", tags: ["ai", "future"], metadata: {}, createdAt: "2025-06-15T11:00:00Z", updatedAt: "2025-06-16T08:00:00Z" },
  { id: 3, title: "Draft: Cooking Tips", body: "Some useful cooking tips...", slug: "draft-cooking-tips", authorId: 1, status: "draft", category: "culture", priority: "low", tags: ["cooking", "lifestyle"], metadata: {}, createdAt: "2025-07-01T14:00:00Z", updatedAt: "2025-07-01T14:00:00Z" },
];

const comments: Comment[] = [
  { id: 1, postId: 1, authorId: 2, body: "Great article!", status: "visible", createdAt: "2025-06-02T10:00:00Z" },
  { id: 2, postId: 1, authorId: 3, body: "Very helpful, thanks.", status: "visible", createdAt: "2025-06-03T15:00:00Z" },
  { id: 3, postId: 2, authorId: 1, body: "Fascinating perspective.", status: "visible", createdAt: "2025-06-16T09:00:00Z" },
  { id: 4, postId: 2, authorId: 3, body: "I disagree with some points.", status: "flagged", createdAt: "2025-06-17T12:00:00Z" },
];

const contentItems: ContentItem[] = [
  { type: "text", id: 1, title: "Welcome Post", createdAt: "2025-05-01T08:00:00Z", body: "Welcome to the platform!", wordCount: 5 },
  { type: "image", id: 2, title: "Logo", createdAt: "2025-05-02T09:00:00Z", imageUrl: "https://example.com/logo.png", width: 800, height: 600, format: "png" },
  { type: "video", id: 3, title: "Intro Video", createdAt: "2025-05-03T10:00:00Z", videoUrl: "https://example.com/intro.mp4", duration: 120, resolution: "1080p" },
];

let currentTheme = "dark";
let notifications: string[] = ["email", "push"];

// ── Auth ──────────────────────────────────────────────────────────────────────

const VALID_USER = "admin";
const VALID_PASS = "password";

function checkAuth(req: Request): Response | null {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Content Platform API"' },
    });
  }
  const decoded = atob(auth.slice(6));
  const [user, pass] = decoded.split(":");
  if (user !== VALID_USER || pass !== VALID_PASS) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers });
}

function paginate<T>(items: T[], page: number, size: number) {
  const start = page * size;
  const content = items.slice(start, start + size);
  return {
    content,
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
    last: start + size >= items.length,
  };
}

function parseIntParam(val: string | null, def: number): number {
  if (!val) return def;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? def : n;
}

// ── Route handling ────────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Simulate latency for realistic progress output
  await new Promise(resolve => setTimeout(resolve, 250));

  // OpenAPI spec — no auth required
  if (method === "GET" && path === "/v3/api-docs") {
    return json(openapiSpec);
  }

  // HEAD /health — no auth required, empty endpoint
  if (method === "HEAD" && path === "/health") {
    return new Response(null, { status: 200 });
  }

  // All other routes require auth
  const authError = checkAuth(req);
  if (authError) return authError;

  // ── Posts (tag: "Content : Posts") ─────────────────────────────────────────

  // GET /posts — PageOfPosts with response headers
  if (method === "GET" && path === "/posts") {
    const page = parseIntParam(url.searchParams.get("page"), 0);
    const size = parseIntParam(url.searchParams.get("size"), 20);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const authorId = url.searchParams.get("authorId");
    const sort = url.searchParams.get("sort") || "createdAt";
    const order = url.searchParams.get("order") || "desc";

    let filtered = [...posts];
    if (status) filtered = filtered.filter(p => p.status === status);
    if (category) filtered = filtered.filter(p => p.category === category);
    if (authorId) filtered = filtered.filter(p => p.authorId === parseInt(authorId));

    filtered.sort((a, b) => {
      const key = sort as keyof Post;
      if (order === "asc") return String(a[key]).localeCompare(String(b[key]));
      return String(b[key]).localeCompare(String(a[key]));
    });

    const result = paginate(filtered, page, size);
    return json(result, 200, {
      "X-Total-Count": String(result.totalElements),
      "X-Page": String(result.page),
      "X-Page-Size": String(result.size),
    });
  }

  // GET /posts/search — deprecated, redirects to /search
  if (method === "GET" && path === "/posts/search") {
    const q = url.searchParams.get("q") || "";
    const results = posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || p.body.toLowerCase().includes(q.toLowerCase()));
    return json(results);
  }

  // GET /posts/:id — PostWithAuthorAndComments (deep nesting)
  const postGetMatch = path.match(/^\/posts\/(\d+)$/);
  if (method === "GET" && postGetMatch) {
    const id = parseInt(postGetMatch[1]);
    const post = posts.find(p => p.id === id);
    if (!post) return json({ error: "Post not found", code: "NOT_FOUND", details: null }, 404);
    const author = users.find(u => u.id === post.authorId) || users[0];
    const postComments = comments
      .filter(c => c.postId === id)
      .map(c => ({
        ...c,
        author: users.find(u => u.id === c.authorId) || users[0],
      }));
    const result: PostWithAuthorAndComments = { ...post, author, comments: postComments };
    return json(result);
  }

  // POST /posts — create post (allOf composition), returns 201 with Location header
  if (method === "POST" && path === "/posts") {
    const body = await req.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string") {
      return json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        fields: [{ field: "title", message: "Title is required", constraint: "NotBlank" }],
      }, 400);
    }
    const post: Post = {
      id: nextPostId++,
      title: body.title as string,
      body: (body.body as string) || "",
      slug: slugify(body.title as string),
      authorId: (body.authorId as number) || 1,
      status: (body.status as Post["status"]) || "draft",
      category: (body.category as Post["category"]) || "other",
      priority: (body.priority as Post["priority"]) || "normal",
      tags: (body.tags as string[]) || [],
      metadata: (body.metadata as Record<string, unknown>) || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    posts.push(post);
    const author = users.find(u => u.id === post.authorId) || users[0];
    const full = { ...post, author, comments: [] };
    return json(full, 201, { Location: `/posts/${post.id}` });
  }

  // POST /posts/:id/publish — inline response schema
  const postPublishMatch = path.match(/^\/posts\/(\d+)\/publish$/);
  if (method === "POST" && postPublishMatch) {
    const id = parseInt(postPublishMatch[1]);
    const post = posts.find(p => p.id === id);
    if (!post) return json({ error: "Post not found", code: "NOT_FOUND", details: null }, 404);
    if (post.status === "published") {
      return json({ error: "Post is already published", code: "CONFLICT", existingId: post.id }, 409);
    }
    post.status = "published";
    post.updatedAt = new Date().toISOString();
    return json({ published: true, publishedAt: post.updatedAt });
  }

  // PUT /posts/:id — update post, can return 200 or 204
  const postPutMatch = path.match(/^\/posts\/(\d+)$/);
  if (method === "PUT" && postPutMatch) {
    const id = parseInt(postPutMatch[1]);
    const post = posts.find(p => p.id === id);
    if (!post) return json({ error: "Post not found", code: "NOT_FOUND", details: null }, 404);
    const body = await req.json() as Record<string, unknown>;
    let changed = false;
    if (body.title !== undefined) { post.title = body.title as string; post.slug = slugify(body.title as string); changed = true; }
    if (body.body !== undefined) { post.body = body.body as string; changed = true; }
    if (body.status !== undefined) { post.status = body.status as Post["status"]; changed = true; }
    if (body.category !== undefined) { post.category = body.category as Post["category"]; changed = true; }
    if (body.priority !== undefined) { post.priority = body.priority as Post["priority"]; changed = true; }
    if (body.tags !== undefined) { post.tags = body.tags as string[]; changed = true; }
    if (body.metadata !== undefined) { post.metadata = body.metadata as Record<string, unknown>; changed = true; }
    if (!changed) return new Response(null, { status: 204 });
    post.updatedAt = new Date().toISOString();
    return json(post);
  }

  // POST /posts/bulk — bulk create (verb dedup test)
  if (method === "POST" && path === "/posts/bulk") {
    const body = await req.json() as Record<string, unknown>[];
    if (!Array.isArray(body) || body.length === 0) {
      return json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        fields: [{ field: "body", message: "Must be a non-empty array", constraint: "Size" }],
      }, 400);
    }
    const created = body.map(b => {
      const post: Post = {
        id: nextPostId++,
        title: (b.title as string) || "Untitled",
        body: (b.body as string) || "",
        slug: slugify((b.title as string) || "untitled"),
        authorId: (b.authorId as number) || 1,
        status: (b.status as Post["status"]) || "draft",
        category: (b.category as Post["category"]) || "other",
        priority: (b.priority as Post["priority"]) || "normal",
        tags: (b.tags as string[]) || [],
        metadata: (b.metadata as Record<string, unknown>) || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      posts.push(post);
      return post;
    });
    return json(created, 201);
  }

  // ── Comments (tag: "Content : Comments") ──────────────────────────────────

  // GET /comments — PageOfComments
  if (method === "GET" && path === "/comments") {
    const page = parseIntParam(url.searchParams.get("page"), 0);
    const size = parseIntParam(url.searchParams.get("size"), 20);
    const postId = url.searchParams.get("postId");
    const status = url.searchParams.get("status");

    let filtered = [...comments];
    if (postId) filtered = filtered.filter(c => c.postId === parseInt(postId));
    if (status) filtered = filtered.filter(c => c.status === status);

    return json(paginate(filtered, page, size));
  }

  // POST /comments
  if (method === "POST" && path === "/comments") {
    const body = await req.json() as Record<string, unknown>;
    const comment: Comment = {
      id: nextCommentId++,
      postId: (body.postId as number) || 1,
      authorId: (body.authorId as number) || 1,
      body: (body.body as string) || "",
      status: "visible",
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    return json(comment, 201);
  }

  // ── Content (tag: "Content : Posts" — polymorphism) ───────────────────────

  // GET /content — returns array of ContentItem (discriminated union)
  if (method === "GET" && path === "/content") {
    const type = url.searchParams.get("type");
    if (type) {
      return json(contentItems.filter(c => c.type === type));
    }
    return json(contentItems);
  }

  // POST /content — create ContentItem (discriminated union input)
  if (method === "POST" && path === "/content") {
    const body = await req.json() as Record<string, unknown>;
    const base = {
      id: nextContentId++,
      title: (body.title as string) || "Untitled",
      createdAt: new Date().toISOString(),
    };
    let item: ContentItem;
    switch (body.type) {
      case "image":
        item = { ...base, type: "image", imageUrl: (body.imageUrl as string) || "", width: (body.width as number) || 0, height: (body.height as number) || 0, format: (body.format as "png") || "png" };
        break;
      case "video":
        item = { ...base, type: "video", videoUrl: (body.videoUrl as string) || "", duration: (body.duration as number) || 0, resolution: (body.resolution as "1080p") || "1080p" };
        break;
      default:
        item = { ...base, type: "text", body: (body.body as string) || "", wordCount: ((body.body as string) || "").split(/\s+/).length };
    }
    contentItems.push(item);
    return json(item, 201);
  }

  // ── Users (tag: "Admin/Users") ────────────────────────────────────────────

  // GET /users — PageOfUsers
  if (method === "GET" && path === "/users") {
    const page = parseIntParam(url.searchParams.get("page"), 0);
    const size = parseIntParam(url.searchParams.get("size"), 20);
    const role = url.searchParams.get("role");
    const status = url.searchParams.get("status");

    let filtered = [...users];
    if (role) filtered = filtered.filter(u => u.role === role);
    if (status) filtered = filtered.filter(u => u.status === status);

    return json(paginate(filtered, page, size));
  }

  // POST /users — accepts JSON or form-urlencoded
  if (method === "POST" && path === "/users") {
    let body: Record<string, unknown>;
    const ct = req.headers.get("Content-Type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } else {
      body = await req.json() as Record<string, unknown>;
    }
    const user: BaseUser = {
      id: nextUserId++,
      username: (body.username as string) || "unnamed",
      email: (body.email as string) || "",
      role: (body.role as BaseUser["role"]) || "viewer",
      status: "active",
      address: (body.address as Address) || { street: "", city: "", state: "", zip: "", country: "US", coordinates: { lat: 0, lng: 0 } },
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    return json(user, 201);
  }

  // GET /admin/users — same tag normalization test (tag: "admin : settings")
  if (method === "GET" && path === "/admin/users") {
    return json(adminUsers);
  }

  // ── Search (poorly-defined params) ────────────────────────────────────────

  if (method === "GET" && path === "/search") {
    const q = url.searchParams.get("q") || "";
    const t = url.searchParams.get("t");
    const f = url.searchParams.get("f");
    const s = url.searchParams.get("s");
    const o = url.searchParams.get("o");
    const p = parseIntParam(url.searchParams.get("p"), 0);
    const ps = parseIntParam(url.searchParams.get("ps"), 20);
    const df = url.searchParams.get("df");
    const dt = url.searchParams.get("dt");
    const x = url.searchParams.get("x");
    const cat = url.searchParams.get("cat");
    const lang = url.searchParams.get("lang");

    const postResults = posts
      .filter(post => q === "" || post.title.toLowerCase().includes(q.toLowerCase()) || post.body.toLowerCase().includes(q.toLowerCase()))
      .map(post => ({ kind: "post" as const, id: post.id, title: post.title, snippet: post.body.slice(0, 100), score: null as number | null, highlight: null as string | null }));

    const userResults = users
      .filter(u => q === "" || u.username.toLowerCase().includes(q.toLowerCase()))
      .map(u => ({ kind: "user" as const, id: u.id, title: u.username, snippet: u.email, score: null as number | null, highlight: null as string | null }));

    const all = [...postResults, ...userResults];
    const start = p * ps;
    const page = all.slice(start, start + ps);

    return json({
      results: page,
      query: q,
      total: all.length,
      page: p,
      pageSize: ps,
      filters: { t, f, s, o, df, dt, x, cat, lang },
      facets: null,
      suggestions: null,
      correctedQuery: null,
      took: null,
    });
  }

  // ── Media upload (overly-optional, supports multipart) ────────────────────

  if (method === "POST" && path === "/media/upload") {
    const ct = req.headers.get("Content-Type") || "";
    let body: Record<string, unknown> = {};
    if (ct.includes("multipart/form-data")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        body[key] = value instanceof File ? `<file:${value.name}>` : value;
      }
    } else {
      body = await req.json().catch(() => ({})) as Record<string, unknown>;
    }
    return json({
      id: nextContentId++,
      url: body.url || null,
      data: body.data || null,
      options: body.options || null,
      meta: body.meta || null,
      status: "accepted",
      createdAt: new Date().toISOString(),
    }, 202);
  }

  // ── Settings (primitive bodies) ───────────────────────────────────────────

  // PUT /settings/theme — body is a raw string
  if (method === "PUT" && path === "/settings/theme") {
    const body = await req.text();
    const theme = body.replace(/^"|"$/g, "");
    currentTheme = theme || currentTheme;
    return json({ theme: currentTheme });
  }

  // GET /settings/theme
  if (method === "GET" && path === "/settings/theme") {
    return json({ theme: currentTheme });
  }

  // PUT /settings/notifications — body is array of strings
  if (method === "PUT" && path === "/settings/notifications") {
    const body = await req.json() as string[];
    notifications = body;
    return json({ notifications });
  }

  // GET /settings/notifications
  if (method === "GET" && path === "/settings/notifications") {
    return json({ notifications });
  }

  // ── Cache (empty endpoint) ────────────────────────────────────────────────

  if (method === "DELETE" && path === "/cache") {
    return new Response(null, { status: 204 });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────

  return json({ error: "Not found", code: "NOT_FOUND", details: null }, 404);
}

// ── OpenAPI 3.0 spec ──────────────────────────────────────────────────────────

const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Content Platform API",
    description: "A deliberately tricky API designed to stress-test OpenAPI codegen with real-world edge cases including Page<T> patterns, discriminated unions, deep allOf composition, poorly-defined params, conflicting tags, verb deduplication, primitive bodies, deep $ref chains, enum-heavy schemas, readOnly/writeOnly fields, deprecated endpoints, response headers, multiple content types, multipart file uploads, and schema validators.",
    version: "1.0.0",
    contact: {
      name: "API Support",
      email: "support@example.com",
    },
  },
  externalDocs: {
    description: "Edge Cases API Wiki",
    url: "https://example.com/wiki/edge-cases-api",
  },
  servers: [{ url: "http://localhost:3458", description: "Local dev" }],
  security: [{ basicAuth: [] }],
  tags: [
    { name: "Content : Posts", description: "Post management (note: colon+space in tag name)" },
    { name: "Content : Comments", description: "Comment management (note: same prefix as Posts)" },
    { name: "Admin/Users", description: "User administration (note: slash in tag name)" },
    { name: "admin : settings", description: "System settings (note: lowercase + colon, conflicts with Admin/Users)" },
    { name: "Search", description: "Search across all content" },
    { name: "Media", description: "Media upload and management" },
    { name: "System", description: "System health and cache" },
  ],
  paths: {
    // ── Posts ──────────────────────────────────────────────────────────────────
    "/posts": {
      get: {
        operationId: "listPosts",
        summary: "List posts with pagination",
        description: "Returns a paginated list of posts. Supports filtering by status, category, and author.",
        tags: ["Content : Posts"],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", format: "int32", default: 0, minimum: 0 }, description: "Page number (zero-based)" },
          { name: "size", in: "query", required: false, schema: { type: "integer", format: "int32", default: 20, minimum: 1, maximum: 100 }, description: "Page size" },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["draft", "published", "archived", "flagged"] }, description: "Filter by post status" },
          { name: "category", in: "query", required: false, schema: { type: "string", enum: ["tech", "science", "culture", "politics", "sports", "other"] }, description: "Filter by category" },
          { name: "authorId", in: "query", required: false, schema: { type: "integer", format: "int64" }, description: "Filter by author ID" },
          { name: "sort", in: "query", required: false, schema: { type: "string", enum: ["createdAt", "updatedAt", "title", "priority"], default: "createdAt" }, description: "Sort field" },
          { name: "order", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" }, description: "Sort order" },
        ],
        responses: {
          "200": {
            description: "Paginated list of posts",
            headers: {
              "X-Total-Count": {
                description: "Total number of matching posts",
                schema: { type: "integer", format: "int64" },
              },
              "X-Page": {
                description: "Current page number",
                schema: { type: "integer", format: "int32" },
              },
              "X-Page-Size": {
                description: "Number of items per page",
                schema: { type: "integer", format: "int32" },
              },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PageOfPosts" } } },
          },
          "400": {
            description: "Invalid parameters",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createPost",
        summary: "Create a new post",
        tags: ["Content : Posts"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreatePost" } } },
        },
        responses: {
          "201": {
            description: "Post created",
            headers: {
              Location: {
                description: "URL of the created post",
                schema: { type: "string", format: "uri" },
              },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PostWithAuthorAndComments" } } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/posts/{id}": {
      get: {
        operationId: "getPost",
        summary: "Get a post by ID with author and comments",
        description: "Returns a deeply nested object: post -> author (with address -> coordinates), comments -> each with author",
        tags: ["Content : Posts"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", format: "int64" }, description: "Post ID" },
        ],
        responses: {
          "200": {
            description: "Post with author and comments (deeply nested)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PostWithAuthorAndComments" } } },
          },
          "401": { description: "Unauthorized" },
          "404": {
            description: "Post not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      put: {
        operationId: "updatePost",
        summary: "Update a post",
        description: "Updates post fields. Returns 200 with updated post if changes were made, or 204 if no changes detected.",
        tags: ["Content : Posts"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", format: "int64" }, description: "Post ID" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdatePost" } } },
        },
        responses: {
          "200": {
            description: "Post updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Post" } } },
          },
          "204": { description: "No changes detected" },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
          "404": {
            description: "Post not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/posts/{id}/publish": {
      post: {
        operationId: "publishPost",
        summary: "Publish a post",
        description: "Transitions a post to published status. Returns inline schema with publish confirmation.",
        tags: ["Content : Posts"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", format: "int64" }, description: "Post ID" },
        ],
        responses: {
          "200": {
            description: "Post published successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    published: { type: "boolean", example: true },
                    publishedAt: { type: "string", format: "date-time", example: "2025-07-01T15:00:00Z" },
                  },
                  required: ["published", "publishedAt"],
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": {
            description: "Post not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "409": {
            description: "Post is already published",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConflictError" } } },
          },
        },
      },
    },

    "/posts/search": {
      get: {
        operationId: "searchPosts",
        summary: "Search posts (deprecated)",
        description: "DEPRECATED: Use GET /search instead. This endpoint searches posts by title and body.",
        deprecated: true,
        tags: ["Content : Posts"],
        externalDocs: {
          description: "Migration guide: moving from /posts/search to /search",
          url: "https://example.com/wiki/search-migration",
        },
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 500 }, description: "Search query" },
        ],
        responses: {
          "200": {
            description: "Matching posts",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Post" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/posts/bulk": {
      post: {
        operationId: "bulkCreatePosts",
        summary: "Bulk create posts",
        description: "Create multiple posts at once. Tests verb deduplication -- same tag, same HTTP method as createPost.",
        tags: ["Content : Posts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/CreatePost" },
                minItems: 1,
                maxItems: 100,
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Posts created",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Post" } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Comments ──────────────────────────────────────────────────────────────

    "/comments": {
      get: {
        operationId: "listComments",
        summary: "List comments with pagination",
        tags: ["Content : Comments"],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", format: "int32", default: 0, minimum: 0 }, description: "Page number" },
          { name: "size", in: "query", required: false, schema: { type: "integer", format: "int32", default: 20, minimum: 1, maximum: 100 }, description: "Page size" },
          { name: "postId", in: "query", required: false, schema: { type: "integer", format: "int64" }, description: "Filter by post ID" },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["visible", "hidden", "flagged", "deleted"] }, description: "Filter by comment status" },
        ],
        responses: {
          "200": {
            description: "Paginated list of comments",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PageOfComments" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createComment",
        summary: "Create a comment",
        tags: ["Content : Comments"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateComment" } } },
        },
        responses: {
          "201": {
            description: "Comment created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Comment" } } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Content (polymorphism) ────────────────────────────────────────────────

    "/content": {
      get: {
        operationId: "listContent",
        summary: "List all content items",
        description: "Returns a mixed array of text, image, and video content items (discriminated union).",
        tags: ["Content : Posts"],
        parameters: [
          { name: "type", in: "query", required: false, schema: { type: "string", enum: ["text", "image", "video"] }, description: "Filter by content type" },
        ],
        responses: {
          "200": {
            description: "Array of content items (discriminated union)",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/ContentItem" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createContent",
        summary: "Create a content item",
        description: "Create a text, image, or video content item. The `type` discriminator determines which fields are required.",
        tags: ["Content : Posts"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ContentItem" } } },
        },
        responses: {
          "201": {
            description: "Content item created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ContentItem" } } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Users ─────────────────────────────────────────────────────────────────

    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List users with pagination",
        tags: ["Admin/Users"],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", format: "int32", default: 0, minimum: 0 }, description: "Page number" },
          { name: "size", in: "query", required: false, schema: { type: "integer", format: "int32", default: 20, minimum: 1, maximum: 100 }, description: "Page size" },
          { name: "role", in: "query", required: false, schema: { type: "string", enum: ["viewer", "editor", "admin", "superadmin"] }, description: "Filter by role" },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["active", "inactive", "suspended", "pending"] }, description: "Filter by account status" },
        ],
        responses: {
          "200": {
            description: "Paginated list of users",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PageOfUsers" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createUser",
        summary: "Create a new user",
        description: "Accepts both application/json and application/x-www-form-urlencoded request bodies. Tests multiple content types on a single endpoint.",
        tags: ["Admin/Users"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateUser" } },
            "application/x-www-form-urlencoded": { schema: { $ref: "#/components/schemas/CreateUserForm" } },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/BaseUser" } } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/admin/users": {
      get: {
        operationId: "listAdminUsers",
        summary: "List admin users with full permissions",
        description: "Returns AdminUser objects which use deep allOf composition: BaseUser + AdminPermissions + department field",
        tags: ["admin : settings"],
        responses: {
          "200": {
            description: "List of admin users",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/AdminUser" } },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Search (poorly-defined) ──────────────────────────────────────────────

    "/search": {
      get: {
        operationId: "search",
        summary: "Search across all content",
        description: "Intentionally poorly-documented search with many cryptically-named parameters.",
        tags: ["Search"],
        externalDocs: {
          description: "Search query syntax reference",
          url: "https://example.com/wiki/search-syntax",
        },
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 500 }, description: "query" },
          { name: "t", in: "query", required: false, schema: { type: "string", enum: ["post", "user", "comment", "content", "all"] }, description: "type" },
          { name: "f", in: "query", required: false, schema: { type: "string", enum: ["json", "xml", "csv"] }, description: "format" },
          { name: "s", in: "query", required: false, schema: { type: "string" }, description: "sort" },
          { name: "o", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"] }, description: "order" },
          { name: "p", in: "query", required: false, schema: { type: "integer", format: "int32", default: 0, minimum: 0 }, description: "page" },
          { name: "ps", in: "query", required: false, schema: { type: "integer", format: "int32", default: 20, minimum: 1, maximum: 200 }, description: "page size" },
          { name: "df", in: "query", required: false, schema: { type: "string", format: "date" }, description: "date from" },
          { name: "dt", in: "query", required: false, schema: { type: "string", format: "date" }, description: "date to" },
          { name: "x", in: "query", required: false, schema: { type: "string" }, description: "extra" },
          { name: "cat", in: "query", required: false, schema: { type: "string" }, description: "category" },
          { name: "lang", in: "query", required: false, schema: { type: "string", pattern: "^[a-z]{2}(-[A-Z]{2})?$" }, description: "language" },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResult" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Media upload (overly-optional, multipart) ────────────────────────────

    "/media/upload": {
      post: {
        operationId: "uploadMedia",
        summary: "Upload media",
        description: "Intentionally vague endpoint where ALL properties are optional and poorly described. Supports both JSON and multipart/form-data.",
        tags: ["Media"],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MediaUploadRequest" },
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "The file to upload" },
                  title: { type: "string", description: "title", maxLength: 255 },
                  description: { type: "string", description: "description", maxLength: 2000 },
                  tags: { type: "string", description: "Comma-separated tags" },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "priority" },
                  overwrite: { type: "string", enum: ["true", "false"], description: "overwrite" },
                },
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Upload accepted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MediaUploadResponse" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Settings (primitive bodies) ──────────────────────────────────────────

    "/settings/theme": {
      get: {
        operationId: "getTheme",
        summary: "Get current theme",
        tags: ["admin : settings"],
        responses: {
          "200": {
            description: "Current theme",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ThemeResponse" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      put: {
        operationId: "setTheme",
        summary: "Set the UI theme",
        description: "Request body is a raw string (not an object). Tests primitive body handling.",
        tags: ["admin : settings"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "string", enum: ["light", "dark", "system", "high-contrast"], description: "Theme name" },
            },
          },
        },
        responses: {
          "200": {
            description: "Theme updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ThemeResponse" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/settings/notifications": {
      get: {
        operationId: "getNotificationSettings",
        summary: "Get notification channels",
        tags: ["admin : settings"],
        responses: {
          "200": {
            description: "Current notification channels",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationResponse" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      put: {
        operationId: "setNotificationChannels",
        summary: "Set notification channels",
        description: "Request body is an array of strings (not an object). Tests primitive array body handling.",
        tags: ["admin : settings"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["email", "push", "sms", "slack", "webhook"],
                },
                minItems: 1,
                maxItems: 10,
                description: "List of enabled notification channels",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Notification channels updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationResponse" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── System (empty endpoints) ─────────────────────────────────────────────

    "/cache": {
      delete: {
        operationId: "clearCache",
        summary: "Clear the cache",
        description: "No request params, no request body, no response body. Tests empty endpoint handling.",
        tags: ["System"],
        responses: {
          "204": { description: "Cache cleared" },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/health": {
      head: {
        operationId: "healthCheck",
        summary: "Health check",
        description: "HEAD-only endpoint. No params, no body, no response body. Tests HEAD method handling.",
        tags: ["System"],
        security: [],
        responses: {
          "200": { description: "Service is healthy" },
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
      // ── Error schemas (different shapes for different error codes) ─────────

      ErrorResponse: {
        type: "object",
        description: "Standard error response for 404 and general errors",
        properties: {
          error: { type: "string", example: "Post not found" },
          code: { type: "string", enum: ["NOT_FOUND", "FORBIDDEN", "INTERNAL_ERROR"], example: "NOT_FOUND" },
          details: { type: "string", nullable: true, example: null },
        },
        required: ["error", "code"],
      },

      ValidationError: {
        type: "object",
        description: "Validation error response for 400 errors",
        properties: {
          error: { type: "string", example: "Validation failed" },
          code: { type: "string", enum: ["VALIDATION_ERROR"], example: "VALIDATION_ERROR" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", example: "title" },
                message: { type: "string", example: "Title is required" },
                constraint: { type: "string", enum: ["NotBlank", "Size", "Pattern", "Min", "Max", "Email"], example: "NotBlank" },
              },
              required: ["field", "message", "constraint"],
            },
          },
        },
        required: ["error", "code", "fields"],
      },

      ConflictError: {
        type: "object",
        description: "Conflict error response for 409 errors",
        properties: {
          error: { type: "string", example: "Post is already published" },
          code: { type: "string", enum: ["CONFLICT", "DUPLICATE"], example: "CONFLICT" },
          existingId: { type: "integer", format: "int64", nullable: true, example: 1 },
        },
        required: ["error", "code"],
      },

      // ── Coordinates (deepest nesting level) ───────────────────────────────
      Coordinates: {
        type: "object",
        properties: {
          lat: { type: "number", format: "double", minimum: -90, maximum: 90, example: 40.7128 },
          lng: { type: "number", format: "double", minimum: -180, maximum: 180, example: -74.006 },
        },
        required: ["lat", "lng"],
      },

      // ── Address (references Coordinates) ──────────────────────────────────
      Address: {
        type: "object",
        properties: {
          street: { type: "string", minLength: 1, maxLength: 200, example: "123 Main St" },
          city: { type: "string", minLength: 1, maxLength: 100, example: "New York" },
          state: { type: "string", minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$", example: "NY" },
          zip: { type: "string", pattern: "^\\d{5}(-\\d{4})?$", example: "10001" },
          country: { type: "string", minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$", default: "US", example: "US" },
          coordinates: { $ref: "#/components/schemas/Coordinates" },
        },
        required: ["street", "city", "state", "zip", "country", "coordinates"],
      },

      // ── BaseUser (references Address, has readOnly + writeOnly) ───────────
      BaseUser: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", readOnly: true, example: 1 },
          username: { type: "string", minLength: 3, maxLength: 50, pattern: "^[a-zA-Z0-9_-]+$", example: "alice" },
          email: { type: "string", format: "email", maxLength: 255, example: "alice@example.com" },
          password: { type: "string", writeOnly: true, minLength: 8, maxLength: 128, format: "password", description: "User password. Write-only: never included in responses." },
          role: { type: "string", enum: ["viewer", "editor", "admin", "superadmin"], default: "viewer", example: "admin" },
          status: { type: "string", enum: ["active", "inactive", "suspended", "pending"], readOnly: true, example: "active" },
          address: { $ref: "#/components/schemas/Address" },
          createdAt: { type: "string", format: "date-time", readOnly: true, example: "2025-01-10T08:00:00Z" },
        },
        required: ["id", "username", "email", "role", "status", "address", "createdAt"],
      },

      // ── AdminPermissions (mixin for allOf) ────────────────────────────────
      AdminPermissions: {
        type: "object",
        properties: {
          canManageUsers: { type: "boolean", default: false, example: true },
          canManageContent: { type: "boolean", default: false, example: true },
          canManageSettings: { type: "boolean", default: false, example: true },
          canViewAnalytics: { type: "boolean", default: false, example: true },
          permissionLevel: { type: "string", enum: ["read", "write", "admin", "superadmin"], default: "read", example: "superadmin" },
        },
        required: ["canManageUsers", "canManageContent", "canManageSettings", "canViewAnalytics", "permissionLevel"],
      },

      // ── AdminUser (deep allOf: BaseUser + AdminPermissions + inline) ──────
      AdminUser: {
        allOf: [
          { $ref: "#/components/schemas/BaseUser" },
          { $ref: "#/components/schemas/AdminPermissions" },
          {
            type: "object",
            properties: {
              department: { type: "string", minLength: 1, maxLength: 100, example: "Engineering" },
            },
            required: ["department"],
          },
        ],
      },

      // ── Post (readOnly id/slug/timestamps, metadata with additionalProperties) ──
      Post: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", readOnly: true, example: 1 },
          title: { type: "string", minLength: 1, maxLength: 300, example: "Getting Started with Bun" },
          body: { type: "string", maxLength: 50000, example: "Bun is a fast JavaScript runtime..." },
          slug: { type: "string", readOnly: true, pattern: "^[a-z0-9-]+$", example: "getting-started-with-bun", description: "Auto-generated URL slug. Read-only." },
          authorId: { type: "integer", format: "int64", example: 1 },
          status: { type: "string", enum: ["draft", "published", "archived", "flagged"], default: "draft", example: "published" },
          category: { type: "string", enum: ["tech", "science", "culture", "politics", "sports", "other"], default: "other", example: "tech" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal", example: "normal" },
          tags: { type: "array", items: { type: "string", maxLength: 50 }, minItems: 0, maxItems: 20, example: ["bun", "javascript"] },
          metadata: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            description: "Arbitrary key-value metadata. Supports any JSON values.",
            example: { featured: true },
          },
          createdAt: { type: "string", format: "date-time", readOnly: true },
          updatedAt: { type: "string", format: "date-time", readOnly: true },
        },
        required: ["id", "title", "body", "slug", "authorId", "status", "category", "priority", "tags", "createdAt", "updatedAt"],
      },

      // ── CreatePost (allOf composition for request body) ───────────────────
      CreatePost: {
        allOf: [
          {
            type: "object",
            properties: {
              title: { type: "string", minLength: 1, maxLength: 300, example: "My New Post" },
              body: { type: "string", maxLength: 50000, example: "Post content here..." },
            },
            required: ["title", "body"],
          },
          {
            type: "object",
            properties: {
              authorId: { type: "integer", format: "int64", example: 1 },
              status: { type: "string", enum: ["draft", "published"], default: "draft", example: "draft" },
              category: { type: "string", enum: ["tech", "science", "culture", "politics", "sports", "other"], default: "other", example: "tech" },
              priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal", example: "normal" },
              tags: { type: "array", items: { type: "string", maxLength: 50 }, minItems: 0, maxItems: 20, example: ["example"] },
              metadata: { type: "object", nullable: true, additionalProperties: true },
            },
          },
        ],
      },

      // ── UpdatePost (all optional, no readOnly fields) ─────────────────────
      UpdatePost: {
        type: "object",
        description: "All fields optional. Only provided fields are updated.",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 300, example: "Updated Title" },
          body: { type: "string", maxLength: 50000, example: "Updated content..." },
          status: { type: "string", enum: ["draft", "published", "archived", "flagged"] },
          category: { type: "string", enum: ["tech", "science", "culture", "politics", "sports", "other"] },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          tags: { type: "array", items: { type: "string", maxLength: 50 }, minItems: 0, maxItems: 20 },
          metadata: { type: "object", nullable: true, additionalProperties: true },
        },
      },

      // ── Comment ───────────────────────────────────────────────────────────
      Comment: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", readOnly: true, example: 1 },
          postId: { type: "integer", format: "int64", example: 1 },
          authorId: { type: "integer", format: "int64", example: 2 },
          body: { type: "string", minLength: 1, maxLength: 5000, example: "Great article!" },
          status: { type: "string", enum: ["visible", "hidden", "flagged", "deleted"], readOnly: true, example: "visible" },
          createdAt: { type: "string", format: "date-time", readOnly: true },
        },
        required: ["id", "postId", "authorId", "body", "status", "createdAt"],
      },

      CreateComment: {
        type: "object",
        properties: {
          postId: { type: "integer", format: "int64", example: 1 },
          authorId: { type: "integer", format: "int64", example: 2 },
          body: { type: "string", minLength: 1, maxLength: 5000, example: "Nice post!" },
        },
        required: ["postId", "body"],
      },

      // ── CommentWithAuthor (nested $ref) ───────────────────────────────────
      CommentWithAuthor: {
        allOf: [
          { $ref: "#/components/schemas/Comment" },
          {
            type: "object",
            properties: {
              author: { $ref: "#/components/schemas/BaseUser" },
            },
            required: ["author"],
          },
        ],
      },

      // ── PostWithAuthorAndComments (deep $ref chain) ───────────────────────
      // Post -> has author (BaseUser -> Address -> Coordinates)
      //      -> has comments[] (CommentWithAuthor -> Comment + BaseUser -> Address -> Coordinates)
      PostWithAuthorAndComments: {
        allOf: [
          { $ref: "#/components/schemas/Post" },
          {
            type: "object",
            properties: {
              author: { $ref: "#/components/schemas/BaseUser" },
              comments: {
                type: "array",
                items: { $ref: "#/components/schemas/CommentWithAuthor" },
              },
            },
            required: ["author", "comments"],
          },
        ],
      },

      // ── Discriminated union (ContentItem) ─────────────────────────────────
      ContentItemBase: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", readOnly: true, example: 1 },
          title: { type: "string", minLength: 1, maxLength: 200, example: "My Content" },
          createdAt: { type: "string", format: "date-time", readOnly: true },
        },
        required: ["id", "title", "createdAt"],
      },

      TextPost: {
        allOf: [
          { $ref: "#/components/schemas/ContentItemBase" },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text"], example: "text" },
              body: { type: "string", maxLength: 50000, example: "Hello world" },
              wordCount: { type: "integer", format: "int32", readOnly: true, minimum: 0, example: 2 },
            },
            required: ["type", "body", "wordCount"],
          },
        ],
      },

      ImagePost: {
        allOf: [
          { $ref: "#/components/schemas/ContentItemBase" },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["image"], example: "image" },
              imageUrl: { type: "string", format: "uri", maxLength: 2000, example: "https://example.com/img.png" },
              width: { type: "integer", format: "int32", minimum: 1, maximum: 10000, example: 800 },
              height: { type: "integer", format: "int32", minimum: 1, maximum: 10000, example: 600 },
              format: { type: "string", enum: ["png", "jpg", "gif", "webp"], example: "png" },
            },
            required: ["type", "imageUrl", "width", "height", "format"],
          },
        ],
      },

      VideoPost: {
        allOf: [
          { $ref: "#/components/schemas/ContentItemBase" },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["video"], example: "video" },
              videoUrl: { type: "string", format: "uri", maxLength: 2000, example: "https://example.com/video.mp4" },
              duration: { type: "integer", format: "int32", minimum: 1, description: "Duration in seconds", example: 120 },
              resolution: { type: "string", enum: ["480p", "720p", "1080p", "4k"], example: "1080p" },
            },
            required: ["type", "videoUrl", "duration", "resolution"],
          },
        ],
      },

      ContentItem: {
        oneOf: [
          { $ref: "#/components/schemas/TextPost" },
          { $ref: "#/components/schemas/ImagePost" },
          { $ref: "#/components/schemas/VideoPost" },
        ],
        discriminator: {
          propertyName: "type",
          mapping: {
            text: "#/components/schemas/TextPost",
            image: "#/components/schemas/ImagePost",
            video: "#/components/schemas/VideoPost",
          },
        },
      },

      // ── Page<T> wrappers ──────────────────────────────────────────────────
      PageOfPosts: {
        type: "object",
        properties: {
          content: { type: "array", items: { $ref: "#/components/schemas/Post" } },
          page: { type: "integer", format: "int32", example: 0 },
          size: { type: "integer", format: "int32", example: 20 },
          totalElements: { type: "integer", format: "int64", example: 3 },
          totalPages: { type: "integer", format: "int32", example: 1 },
          last: { type: "boolean", example: true },
        },
        required: ["content", "page", "size", "totalElements", "totalPages", "last"],
      },

      PageOfComments: {
        type: "object",
        properties: {
          content: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
          page: { type: "integer", format: "int32", example: 0 },
          size: { type: "integer", format: "int32", example: 20 },
          totalElements: { type: "integer", format: "int64", example: 4 },
          totalPages: { type: "integer", format: "int32", example: 1 },
          last: { type: "boolean", example: true },
        },
        required: ["content", "page", "size", "totalElements", "totalPages", "last"],
      },

      PageOfUsers: {
        type: "object",
        properties: {
          content: { type: "array", items: { $ref: "#/components/schemas/BaseUser" } },
          page: { type: "integer", format: "int32", example: 0 },
          size: { type: "integer", format: "int32", example: 20 },
          totalElements: { type: "integer", format: "int64", example: 3 },
          totalPages: { type: "integer", format: "int32", example: 1 },
          last: { type: "boolean", example: true },
        },
        required: ["content", "page", "size", "totalElements", "totalPages", "last"],
      },

      // ── CreateUser (JSON body) ────────────────────────────────────────────
      CreateUser: {
        type: "object",
        properties: {
          username: { type: "string", minLength: 3, maxLength: 50, pattern: "^[a-zA-Z0-9_-]+$", example: "newuser" },
          email: { type: "string", format: "email", maxLength: 255, example: "newuser@example.com" },
          password: { type: "string", writeOnly: true, minLength: 8, maxLength: 128, format: "password", description: "Initial password" },
          role: { type: "string", enum: ["viewer", "editor", "admin", "superadmin"], default: "viewer", example: "viewer" },
          address: { $ref: "#/components/schemas/Address" },
        },
        required: ["username", "email", "password"],
      },

      // ── CreateUserForm (form-urlencoded body, flat) ───────────────────────
      CreateUserForm: {
        type: "object",
        description: "Flat form for creating a user via application/x-www-form-urlencoded. Address fields are not supported in this format.",
        properties: {
          username: { type: "string", minLength: 3, maxLength: 50, example: "newuser" },
          email: { type: "string", format: "email", example: "newuser@example.com" },
          password: { type: "string", format: "password", minLength: 8, maxLength: 128 },
          role: { type: "string", enum: ["viewer", "editor", "admin", "superadmin"], default: "viewer" },
        },
        required: ["username", "email", "password"],
      },

      // ── SearchResult (poorly-defined, mostly nullable/optional) ───────────
      SearchResult: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/SearchResultItem" },
          },
          query: { type: "string", nullable: true },
          total: { type: "integer", format: "int64", nullable: true },
          page: { type: "integer", format: "int32", nullable: true },
          pageSize: { type: "integer", format: "int32", nullable: true },
          filters: {
            type: "object",
            nullable: true,
            additionalProperties: { type: "string", nullable: true },
            description: "Applied filters",
          },
          facets: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            description: "Faceted counts",
          },
          suggestions: {
            type: "array",
            nullable: true,
            items: { type: "string" },
          },
          correctedQuery: { type: "string", nullable: true },
          took: { type: "integer", format: "int32", nullable: true, description: "Time in ms" },
        },
      },

      SearchResultItem: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["post", "user", "comment", "content"], nullable: true },
          id: { type: "integer", format: "int64", nullable: true },
          title: { type: "string", nullable: true },
          snippet: { type: "string", nullable: true, maxLength: 500 },
          score: { type: "number", format: "float", nullable: true },
          highlight: { type: "string", nullable: true },
        },
      },

      // ── MediaUploadRequest (ALL optional, vague descriptions) ─────────────
      MediaUploadRequest: {
        type: "object",
        description: "Upload request. All fields are optional.",
        properties: {
          data: { type: "string", description: "data", nullable: true },
          url: { type: "string", format: "uri", description: "url", nullable: true },
          options: {
            type: "object",
            description: "options",
            nullable: true,
            additionalProperties: true,
          },
          meta: {
            type: "object",
            description: "meta",
            nullable: true,
            additionalProperties: true,
          },
          tags: {
            type: "array",
            description: "tags",
            nullable: true,
            items: { type: "string", maxLength: 50 },
            maxItems: 50,
          },
          priority: {
            type: "string",
            description: "priority",
            nullable: true,
            enum: ["low", "normal", "high", "urgent"],
          },
          callback: { type: "string", format: "uri", description: "callback", nullable: true },
          format: { type: "string", description: "format", nullable: true },
          overwrite: { type: "boolean", description: "overwrite", nullable: true, default: false },
          ttl: { type: "integer", format: "int32", description: "ttl in seconds", nullable: true, minimum: 0, maximum: 86400 },
        },
      },

      MediaUploadResponse: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", readOnly: true },
          url: { type: "string", format: "uri", nullable: true },
          data: { type: "string", nullable: true },
          options: { type: "object", nullable: true, additionalProperties: true },
          meta: { type: "object", nullable: true, additionalProperties: true },
          status: { type: "string", enum: ["accepted", "processing", "complete", "failed"] },
          createdAt: { type: "string", format: "date-time", readOnly: true },
        },
        required: ["id", "status", "createdAt"],
      },

      // ── Settings responses ────────────────────────────────────────────────
      ThemeResponse: {
        type: "object",
        properties: {
          theme: { type: "string", enum: ["light", "dark", "system", "high-contrast"] },
        },
        required: ["theme"],
      },

      NotificationResponse: {
        type: "object",
        properties: {
          notifications: {
            type: "array",
            items: { type: "string", enum: ["email", "push", "sms", "slack", "webhook"] },
            minItems: 0,
            maxItems: 10,
          },
        },
        required: ["notifications"],
      },
    },
  },
};

// ── Start server ──────────────────────────────────────────────────────────────

const PORT = 3458;

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`Content Platform API (edge cases) running on http://localhost:${PORT}`);
console.log(`OpenAPI spec: http://localhost:${PORT}/v3/api-docs`);
console.log(`Auth: admin / password`);
