import { PageConfig } from 'next'

export const config: PageConfig = {
  runtime: 'nodejs',
}

export default function handler(req, res) {
  res.json({ hello: 'world' })
}
