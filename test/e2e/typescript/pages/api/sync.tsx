import { NextApiHandler } from 'next'

const SyncApiEndpoint: NextApiHandler = (req, res) => {
  res.status(200).json({ code: 'ok' })
}

export default SyncApiEndpoint
