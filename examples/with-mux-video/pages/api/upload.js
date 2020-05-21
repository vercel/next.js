import Mux from '@mux/mux-node'
const { Video } = new Mux()

export default async function uploadHandler(req, res) {
  const { method } = req

  switch (method) {
    case 'POST':
      try {
        const upload = await Video.Uploads.create({
          new_asset_settings: { playback_policy: 'public' },
          cors_origin: '*',
        })
        res.json({
          id: upload.id,
          url: upload.url,
        })
      } catch (e) {
        res.statusCode = 500
        console.error('Request error', e)
        res.json({ error: 'Error creating upload' })
      }
      break
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
