import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportResponse, arr } from "./mfl.mjs";

// MFL's import endpoint returns XML (ignoring JSON=1). The old imp() blindly
// called res.json() and threw SyntaxError even on success. These pin the fix.

test("parses an XML OK status into a result object", () => {
  const r = parseImportResponse('<?xml version="1.0" encoding="utf-8"?>\n<status>OK</status>');
  assert.deepEqual(r, { status: "OK" });
});

test("throws on an XML error response, surfacing the message", () => {
  assert.throws(
    () => parseImportResponse('<?xml version="1.0"?><error>Player not available</error>'),
    /Player not available/,
  );
});

test("still handles a JSON response if MFL returns one", () => {
  assert.deepEqual(parseImportResponse('{"ok":1}'), { ok: 1 });
});

test("throws when a JSON response carries an error field", () => {
  assert.throws(() => parseImportResponse('{"error":"bad request"}'), /bad request/);
});

test("arr normalizes MFL's single-object-or-array quirk", () => {
  assert.deepEqual(arr(undefined), []);
  assert.deepEqual(arr({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(arr([1, 2]), [1, 2]);
});
