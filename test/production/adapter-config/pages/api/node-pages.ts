import { NextApiRequest, NextApiResponse } from 'next/dist/types'

export const config = {
  maxDuration: 70,
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.contract === 'handoff') {
    res.setHeader('Set-Cookie', [
      'reference-a=one; Path=/',
      'reference-b=two; Path=/',
    ])
    res.status(201).json({
      body: req.body,
      values: req.query.value,
      header: req.headers['x-reference-input'],
    })
    return
  }
  console.log(req.url)
  res.json({ now: Date.now() })
}
