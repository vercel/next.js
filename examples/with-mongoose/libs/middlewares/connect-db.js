import { SERVICE_UNAVAILABLE } from 'http-status-codes'

import { connect } from 'libs/db'

/**
 * Connect to MongoDB or catch the error
 *
 * @export
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {Function} next
 */
export async function connectDB(req, res, next) {
  try {
    await connect()
    next()
  } catch (error) {
    res.status(SERVICE_UNAVAILABLE).json({
      statusCode: SERVICE_UNAVAILABLE,
      message: 'Database connection error',
    })
  }
}
