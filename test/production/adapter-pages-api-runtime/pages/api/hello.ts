import type { NextApiRequest, NextApiResponse } from 'next'
import storyblok from 'test-storyblok-external'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  void storyblok
  res.status(200).json({ hello: 'world' })
}
