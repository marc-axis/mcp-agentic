import { strictEqual, ok } from "node:assert";
import { test } from "node:test";
import { hashKey } from "./supabase.js";

test("hashKey returns consistent sha256 hex", () => {
  const a = hashKey("test-key-123");
  const b = hashKey("test-key-123");
  strictEqual(a, b);
  strictEqual(a.length, 64);
});

test("hashKey returns different values for different keys", () => {
  const a = hashKey("key-one");
  const b = hashKey("key-two");
  ok(a !== b);
});
