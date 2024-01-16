import type { NextApiRequest, NextApiResponse } from "next";
import { TodoItem } from "../../../db/models/todoItems";
import tigrisDb from "../../../lib/tigris";

type Response = {
  result?: Array<TodoItem>;
  error?: string;
};

async function handleGet(req: NextApiRequest, res: NextApiResponse<Response>) {
  try {
    const itemsCollection = tigrisDb.getCollection<TodoItem>(TodoItem);
    const cursor = itemsCollection.findMany();
    const items = await cursor.toArray();
    res.status(200).json({ result: items });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<Response>) {
  try {
    const item = JSON.parse(req.body) as TodoItem;
    const itemsCollection = tigrisDb.getCollection<TodoItem>(TodoItem);
    const inserted = await itemsCollection.insertOne(item);
    res.status(200).json({ result: [inserted] });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
}

// GET /api/items -- gets items from collection
// POST /api/items {ToDoItem} -- inserts a new item to collection
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>,
) {
  switch (req.method) {
    case "GET":
      await handleGet(req, res);
      break;
    case "POST":
      await handlePost(req, res);
      break;
    default:
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
