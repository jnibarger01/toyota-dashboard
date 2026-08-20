import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("scratch notes are user-scoped and removable", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0006_service_scratch_notes.sql", import.meta.url), "utf8"));
  await db.query("insert into service_scratch_notes (id, user_id, text) values ('note-a', 'advisor-a', 'Call customer'), ('note-b', 'advisor-b', 'Other advisor note')");
  await db.query("delete from service_scratch_notes where id = $1 and user_id = $2", ["note-a", "advisor-a"]);
  const remaining = (await db.query<{ id: string }>("select id from service_scratch_notes where user_id = 'advisor-a'")).rows;
  assert.deepEqual(remaining, []);
  assert.deepEqual((await db.query<{ id: string }>("select id from service_scratch_notes where user_id = 'advisor-b'")).rows, [{ id: "note-b" }]);
});
