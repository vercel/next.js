import type { NextApiRequest, NextApiResponse } from 'next'
import { type ToDo } from '../../lib/todos'
import * as todos from '../../lib/todos'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ToDo[] | string>
) {
  switch (req.method) {
    case 'GET':
      return res.status(200).json(await todos.list())
    case 'POST':
      return res.status(201).json(await todos.create(req.body))
    case 'PUT':
      const updated = await todos.update(req.body)
      return res.status(updated.length > 0 ? 200 : 404).json(updated)
    case 'DELETE':
      const removed = await todos.remove(req.body)
      return res.status(removed.length > 0 ? 204 : 404).end()
    default:
      return res.status(405).send('Method Not Allowed')
  }
}
