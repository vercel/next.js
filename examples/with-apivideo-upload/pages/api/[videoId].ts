import type { NextApiRequest, NextApiResponse } from 'next'
import ApiVideoClient from '@api.video/nodejs-client'

export default async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        const { videoId } = req.query
        const client = new ApiVideoClient({ apiKey: "Ia8SciREqEq01syrKgeYXCm7L5jNUetFAfiGv67rnWJ" })
        const status = await client.videos.getStatus(videoId as string)
        res.status(200).json({ status })
    } catch (error) {
        res.status(400).end()
    }
}