import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async function assetHandler(req, res) {
  const { method } = req

  switch (method) {
    case 'GET':
      try {
        const asset = await Video.Assets.get(req.query.id)
        res.json({
          asset: {
            id: asset.id,
            status: asset.status,
            errors: asset.errors,
            playback_id: asset.playback_ids[0].id,
          },
        })
      } catch (e) {
        console.error('Request error', e)
        res.status(500).json({ error: 'Error getting upload/asset' })
      }
      break
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
