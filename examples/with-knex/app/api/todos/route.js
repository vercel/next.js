import { getKnex } from "../../../knex";

export async function GET(req) {
  const knex = getKnex();
  const todos = await knex("todos");
  return Response.json(todos);
}
