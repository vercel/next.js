import { getKnex } from "../../knex";

export default async function handler(req, res) {
  const knex = getKnex();
  const todos = await knex("todos");
  res.status(200).json(todos);
}
