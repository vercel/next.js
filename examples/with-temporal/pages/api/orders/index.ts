import { NextApiRequest, NextApiResponse } from 'next'
import { WorkflowClient } from '@temporalio/client'
import { order } from '../../../temporal/src/workflows'

export type Data = {
  result: string
}

function getUserId(token?: string): string {
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
  const client = new WorkflowClient()

  // Execute the order Workflow and wait for it to finish
  const result = await client.execute(order, {
    taskQueue: 'my-nextjs-project',
    workflowId: 'my-business-id',
    args: [userId, itemId, quantity],
  })

  return res.status(200).json({ result })
}
