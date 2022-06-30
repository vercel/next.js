import type { NextApiRequest, NextApiResponse } from 'next'
import auth0 from '../../lib/auth0'

const callback = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await auth0.handleCallback(req, res)
  } catch (error) {
    console.error(error)
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error'
    res.status(500).end(errorMessage)
  }
}

export default callback
