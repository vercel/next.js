import { NextApiRequest, NextApiResponse } from 'next'
import { Connection, WorkflowClient } from '@temporalio/client'
import { Order } from '../../../temporal/src/interfaces/workflows'

export type Data = {
  result: string
}

function getUserId(token: string): string {
  // TODO if the token is a JWT, decode & verify it. If it's a session ID,
  // look up the user's ID in the session store.
  return 'user-id-123'
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    res.send({ result: 'Error code 405: use POST' })
    return
  }

  const userId: string = getUserId(req.headers.authorization)
  const { itemId, quantity } = JSON.parse(req.body)

  // Connect to our Temporal Server running locally in Docker
  const connection = new Connection()
  const client = new WorkflowClient(connection.service)
  const example = client.stub<Order>('order', { taskQueue: 'orders' })

  // Execute the Order workflow and wait for it to finish
  const result = await example.execute(userId, itemId, quantity)
  return res.status(200).json({ result })
}
