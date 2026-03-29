import { describe, expect, test } from "bun:test";
import { formatDryRun, formatCurl, type CapturedRequest } from "../src/output-request";

describe("formatDryRun", () => {
  test("formats POST with body and masked auth", () => {
    const req: CapturedRequest = {
      method: "POST",
      url: "https://api.example.com/v1/todos",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic dXNlcjpwYXNz",
      },
      body: { title: "My Task", description: "Details" },
    };
    const output = formatDryRun(req);
    expect(output).toContain("POST https://api.example.com/v1/todos");
    expect(output).toContain("Content-Type: application/json");
    expect(output).toContain("Authorization: ****");
    expect(output).not.toContain("dXNlcjpwYXNz");
    expect(output).toContain('"title": "My Task"');
  });

  test("formats GET without body section", () => {
    const req: CapturedRequest = {
      method: "GET",
      url: "https://api.example.com/v1/todos",
      headers: { "Content-Type": "application/json" },
    };
    const output = formatDryRun(req);
    expect(output).toContain("GET https://api.example.com/v1/todos");
    expect(output).not.toContain("Body:");
  });

  test("masks authorization header case-insensitively", () => {
    const req: CapturedRequest = {
      method: "GET",
      url: "https://api.example.com/test",
      headers: { "authorization": "Bearer token123" },
    };
    const output = formatDryRun(req);
    expect(output).toContain("authorization: ****");
    expect(output).not.toContain("token123");
  });
});

describe("formatCurl", () => {
  test("formats POST with body, excludes auth by default", () => {
    const req: CapturedRequest = {
      method: "POST",
      url: "https://api.example.com/v1/todos",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic dXNlcjpwYXNz",
      },
      body: { title: "My Task" },
    };
    const output = formatCurl(req, { includeCreds: false });
    expect(output).toContain("curl -X POST");
    expect(output).toContain("'https://api.example.com/v1/todos'");
    expect(output).toContain("-H 'Content-Type: application/json'");
    expect(output).not.toContain("Authorization");
    expect(output).toContain("-d ");
    expect(output).toContain('"title":"My Task"');
  });

  test("includes auth header when includeCreds is true", () => {
    const req: CapturedRequest = {
      method: "POST",
      url: "https://api.example.com/v1/todos",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic dXNlcjpwYXNz",
      },
      body: { title: "My Task" },
    };
    const output = formatCurl(req, { includeCreds: true });
    expect(output).toContain("-H 'Authorization: Basic dXNlcjpwYXNz'");
  });

  test("GET request omits -X and -d", () => {
    const req: CapturedRequest = {
      method: "GET",
      url: "https://api.example.com/v1/todos?page=1",
      headers: { "Content-Type": "application/json" },
    };
    const output = formatCurl(req, { includeCreds: false });
    expect(output).not.toContain("-X ");
    expect(output).not.toContain("-d ");
    expect(output).toStartWith("curl ");
    expect(output).toContain("'https://api.example.com/v1/todos?page=1'");
  });

  test("uses line continuations for readability", () => {
    const req: CapturedRequest = {
      method: "POST",
      url: "https://api.example.com/v1/todos",
      headers: { "Content-Type": "application/json" },
      body: { title: "test" },
    };
    const output = formatCurl(req, { includeCreds: false });
    expect(output).toContain(" \\\n");
  });

  test("DELETE request includes -X DELETE, no body", () => {
    const req: CapturedRequest = {
      method: "DELETE",
      url: "https://api.example.com/v1/todos/123",
      headers: { "Content-Type": "application/json" },
    };
    const output = formatCurl(req, { includeCreds: false });
    expect(output).toContain("curl -X DELETE");
    expect(output).not.toContain("-d ");
  });
});
