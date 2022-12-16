import { NextApiRequest, NextApiResponse } from 'next'
import {
  COLLECTION_NAME,
  TodoItem,
} from '../../../models/tigris/todoStarterApp/todoItems'
import tigrisDb from '../../../lib/tigris'

type Data = {
  result?: TodoItem
  error?: string
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
  itemId: number
) {
  try {
    const itemsCollection = tigrisDb.getCollection<TodoItem>(COLLECTION_NAME)
    const item = await itemsCollection.findOne({ id: itemId })
    if (!item) {
      res.status(404).json({ error: 'No item found' })
    } else {
      res.status(200).json({ result: item })
    }
  } catch (err) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const item = JSON.parse(req.body) as TodoItem
    const itemsCollection = tigrisDb.getCollection<TodoItem>(COLLECTION_NAME)
    const updated = await itemsCollection.insertOrReplaceOne(item)
    res.status(200).json({ result: updated })
  } catch (err) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
  itemId: number
) {
  try {
    const itemsCollection = tigrisDb.getCollection<TodoItem>(COLLECTION_NAME)
    const status = (await itemsCollection.deleteOne({ id: itemId })).status
    if (status === 'deleted') {
      res.status(200).json({})
    } else {
      res.status(500).json({ error: `Failed to delete ${itemId}` })
    }
  } catch (err) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

// GET /api/item/[id] -- gets item from collection where id = [id]
// PUT /api/item/[id] {ToDoItem} -- updates the item in collection where id = [id]
// DELETE /api/item/[id] -- deletes the item in collection where id = [id]
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const { id } = req.query
  switch (req.method) {
    case 'GET':
      await handleGet(req, res, Number(id))
      break
    case 'PUT':
      await handlePut(req, res)
      break
    case 'DELETE':
      await handleDelete(req, res, Number(id))
      break
    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
