import { strictEqual } from "node:assert";
import { test } from "node:test";
import { extractBearerToken } from "./auth.js";

test("extractBearerToken returns key from Authorization header", () => {
  const req = { headers: { authorization: "Bearer my-secret-key" } };
  strictEqual(extractBearerToken(req), "my-secret-key");
});

test("extractBearerToken returns null when header missing", () => {
  const req = { headers: {} };
  strictEqual(extractBearerToken(req), null);
});

test("extractBearerToken returns null for non-Bearer scheme", () => {
  const req = { headers: { authorization: "Basic abc123" } };
  strictEqual(extractBearerToken(req), null);
});
