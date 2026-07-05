import { NextApiHandler } from 'next'

const AsyncApiEndpoint: NextApiHandler = async (req, res) => {
  res.status(200).json({ code: 'ok' })
}

export default AsyncApiEndpoint
