import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('error', () => {
    // The fixture intentionally fails one response after headers are committed.
  })
  res.setHeader('Content-Type', 'text/event-stream')
  res.flushHeaders()
  res.write('data: started\n\n')

  const timer = setTimeout(() => {
    if (req.query.outcome === 'error') {
      res.destroy(new Error('intentional response stream failure'))
      return
    }

    if (req.query.outcome !== 'abort') {
      res.end('data: finished\n\n')
    }
  }, 50)

  res.on('close', () => clearTimeout(timer))
}
