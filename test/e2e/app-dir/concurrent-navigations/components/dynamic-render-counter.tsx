import { connection } from 'next/server'
import { RenderCounterClient } from './dynamic-render-counter.client'

import 'server-only'

export async function DynamicRenderCounter(): Promise<React.ReactNode> {
  // Renders a count of the number of times the client receives new dynamic data
  // from the server. The count is computed on the client and stored in React
  // state, so it gets reset if the state of the tree is reset.
  await connection()
  const uuid = crypto.randomUUID()
  return <RenderCounterClient uuid={uuid} />
}
