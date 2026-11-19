import type { NextApiRequest, NextApiResponse } from 'next'

let hangUps = 0

// Answers how many times it has hung up; with ?mode=hangup it closes the
// connection without answering.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.mode === 'hangup') {
    hangUps++
    req.socket.destroy()
    return
  }
  res.send(String(hangUps))
}
