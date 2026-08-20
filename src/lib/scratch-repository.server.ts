import type { Sql } from "@/lib/db";
import type { ScratchNote } from "@/lib/types";

type ScratchRow = { id: string; text: string; created_at: string };
const map = (row: ScratchRow): ScratchNote => ({ id: row.id, text: row.text, createdAt: row.created_at });

export class ScratchRepository {
  constructor(private readonly sql: Sql) {}

  async list(userId: string): Promise<ScratchNote[]> {
    return (await this.sql.query<ScratchRow>("select id, text, created_at from service_scratch_notes where user_id = $1 order by created_at desc, id desc", [userId])).map(map);
  }

  async importIfEmpty(userId: string, notes: ScratchNote[]): Promise<void> {
    const [{ count }] = await this.sql.query<{ count: number }>("select count(*)::int as count from service_scratch_notes where user_id = $1", [userId]);
    if (count || !notes.length) return;
    for (const note of notes) await this.sql.query("insert into service_scratch_notes (id, user_id, text, created_at) values ($1,$2,$3,$4)", [note.id, userId, note.text, note.createdAt]);
  }

  async create(input: { id: string; userId: string; text: string }): Promise<ScratchNote> {
    const rows = await this.sql.query<ScratchRow>("insert into service_scratch_notes (id, user_id, text) values ($1,$2,$3) returning id, text, created_at", [input.id, input.userId, input.text]);
    return map(rows[0]!);
  }

  async remove(input: { id: string; userId: string }): Promise<void> {
    const rows = await this.sql.query<{ id: string }>("delete from service_scratch_notes where id = $1 and user_id = $2 returning id", [input.id, input.userId]);
    if (!rows[0]) throw new Error("Scratch note not found");
  }
}
