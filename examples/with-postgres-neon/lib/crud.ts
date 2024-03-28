import sql from "./db";

export interface ToDo {
  id: number;
  text: string;
  done: boolean;
}

export async function list() {
  return await sql`
    SELECT id, text, done FROM todos
    ORDER BY id
  `;
}

export async function create(todo: ToDo) {
  return await sql`
    INSERT INTO todos (text, done) VALUES (${todo.text}, false)
    RETURNING id, text, done
  `;
}

export async function update(todo: ToDo) {
  return await sql`
    UPDATE todos SET done=${todo.done} WHERE id=${todo.id}
    RETURNING id, text, done
  `;
}

export async function remove(todo: ToDo) {
  return await sql`
    DELETE FROM todos WHERE id=${todo.id}
    RETURNING id, text, done
  `;
}
