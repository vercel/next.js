export const runtime = 'nodejs'
export const maxDuration = 10
export const config = { runtime: 'edge', maxDuration: 20 }

export default function handler(_req, res) {
  res.status(200).json({ runtime: process.env.NEXT_RUNTIME })
}
