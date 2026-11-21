import type { NextApiRequest, NextApiResponse } from 'next'
import { createControl, inYoungGeneration } from '../../lib/in-young-generation'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    control: inYoungGeneration(createControl()),
    write: inYoungGeneration(res.write),
    end: inYoungGeneration(res.end),
    status: inYoungGeneration(res.status),
    send: inYoungGeneration(res.send),
    json: inYoungGeneration(res.json),
    redirect: inYoungGeneration(res.redirect),
    setDraftMode: inYoungGeneration(res.setDraftMode),
    setPreviewData: inYoungGeneration(res.setPreviewData),
    clearPreviewData: inYoungGeneration(res.clearPreviewData),
    revalidate: inYoungGeneration(res.revalidate),
  })
}
