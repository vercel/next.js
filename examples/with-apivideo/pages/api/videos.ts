import type { NextApiRequest, NextApiResponse } from 'next'
import ApiVideoClient from '@api.video/nodejs-client'

const getVideoStatus = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const client = new ApiVideoClient({ apiKey: process.env.API_KEY })
    const videos = await client.videos.list()
    res.status(200).json({ videos })
  } catch (error) {
    res.status(400).end()
  }
}

export default getVideoStatus
