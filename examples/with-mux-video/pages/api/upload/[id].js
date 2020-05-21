import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async function uploadHandler(req, res) {
  const { method } = req

  switch (method) {
    case 'GET':
      try {
        const upload = await Video.Uploads.get(req.query.id)
        let asset
        if (upload.status === 'asset_created') {
          asset = await Video.Assets.get(upload.asset_id)
        }
        res.json({
          upload: { status: upload.status, url: upload.url },
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
      break
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
