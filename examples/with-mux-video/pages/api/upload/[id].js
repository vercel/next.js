import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async function uploadHandler(req, res) {
  const { method } = req

  switch (method) {
    case 'GET':
      try {
        const upload = await Video.Uploads.get(req.query.id)
        res.json({
          upload: {
            status: upload.status,
            url: upload.url,
            asset_id: upload.asset_id,
          },
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
