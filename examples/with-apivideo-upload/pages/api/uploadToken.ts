import type { NextApiRequest, NextApiResponse } from 'next'
import ApiVideoClient from '@api.video/nodejs-client'

export default async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        const client = new ApiVideoClient({ apiKey: "Ia8SciREqEq01syrKgeYXCm7L5jNUetFAfiGv67rnWJ" })
        const uploadToken = await client.uploadTokens.createToken()
        res.status(200).json({ uploadToken })
    } catch (error) {
        res.status(400).end()
    }
}