import type { NextApiRequest, NextApiResponse } from 'next'
import v8 from 'node:v8'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const getHeapStatistics = v8.getHeapStatistics
  // Exercise the real restart path without allocating the machine's heap limit.
  v8.getHeapStatistics = () => {
    const stats = getHeapStatistics()
    return { ...stats, used_heap_size: stats.heap_size_limit }
  }
  res.json({ restarting: true })
}
