// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      const upload = await Video.Uploads.create({
        new_asset_settings: { playback_policy: 'public' },
      })
      res.json({
        uploadId: upload.id,
      })
    } catch (e) {
      res.statusCode = 500
      console.error('Request error', e)
      res.json({ error: 'Error creating upload' })
    }
  } else {
    res.statusCode = 404
    res.json({ message: 'Not found' })
  }
}
