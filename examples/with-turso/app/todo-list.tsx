import { type TodoItem, Todo } from "./todo";

import { db } from "@/lib/turso";

// The code below can be removed in production apps
// Useful for getting started locally with SQLite
async function findOrCreateTodosTable() {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='todos'",
  );

  if (!result || result?.rows?.length === 0) {
    await db.execute(
      "CREATE TABLE todos(id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL)",
    );
  }
}

export async function TodoList() {
  await findOrCreateTodosTable();
  const result = await db.execute("SELECT * FROM todos");
  const rows = result.rows as unknown as TodoItem[];

  if (!result || result?.rows?.length === 0) return null;

  return rows.map((row, index) => (
    <Todo
      key={index}
      item={{
        id: row.id,
        description: row.description,
      }}
    />
  ));
}
