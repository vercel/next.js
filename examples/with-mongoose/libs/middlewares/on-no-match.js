import { NOT_FOUND } from 'http-status-codes'

/**
 * Handle no match route
 *
 * @export
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
export function onNoMatch(req, res) {
  res.status(NOT_FOUND)
  res.end({
    statusCode: NOT_FOUND,
    message: 'Route is not found',
  })
}
