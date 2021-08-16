import { NextApiRequest, NextApiResponse } from 'next'
import { Connection, WorkflowClient } from '@temporalio/client'
import { Example } from '../../temporal/src/interfaces/workflows'

type Data = {
  result: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const connection = new Connection()
  const client = new WorkflowClient(connection.service)
  const example = client.stub<Example>('example', { taskQueue: 'tutorial' })
  const result = await example.execute('Temporal')
  console.log(result) // Hello, Temporal!
  res.status(200).json({ result })
}
