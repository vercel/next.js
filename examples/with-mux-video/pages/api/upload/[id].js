// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async (req, res) => {
  if (req.method === 'GET') {
    try {
      const upload = await Video.Uploads.get(req.query.id)
      let asset
      if (upload.status === 'asset_created') {
        asset = await Video.Assets.get(upload.asset_id)
      }
      res.json({
        upload: { status: upload.status },
        asset: asset
          ? {
              id: asset.id,
              status: asset.status,
              playback_id: asset.playback_ids[0].id,
            }
          : null,
      })
    } catch (e) {
      res.statusCode = 500
      console.error('Request error', e)
      res.json({ error: 'Error getting upload/asset' })
    }
  } else {
    res.statusCode = 404
    res.json({ message: 'Not found' })
  }
}
