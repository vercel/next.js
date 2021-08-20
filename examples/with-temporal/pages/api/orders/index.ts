import { NextApiRequest, NextApiResponse } from 'next'
import { Connection, WorkflowClient } from '@temporalio/client'
import { Order } from '../../../temporal/src/interfaces/workflows'

export type Data = {
  result: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    res.send({ result: 'Error code 405: use POST' })
    return
  }

  const userId: string = req.headers.authorization // FIXME insecure 😄
  const { itemId, quantity } = JSON.parse(req.body)

  // Connect to our Temporal Server running locally in Docker
  const connection = new Connection()
  const client = new WorkflowClient(connection.service)
  const example = client.stub<Order>('order', { taskQueue: 'orders' })

  // Execute the Order workflow and wait for it to finish
  const result = await example.execute(userId, itemId, quantity)
  res.status(200).json({ result })
}
