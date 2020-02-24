import TakeShape from '../../providers/takeshape'
import { homePageQuery } from '../index.js'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function getTakeShapeData(req, res, query) {
  res.setHeader('Content-Type', 'application/json')
  try {
    /* Only allow GET requests */
    if (req.method !== 'GET') throw new ApiError(405, 'Method Not Allowed')
    /* Grab the data from TakeShape */
    const takeshapeRes = await TakeShape.graphql({ query: query })
    /* If the request if malformed, throw an error */
    if (!takeshapeRes.ok)
      throw new ApiError(takeshapeRes.status, takeshapeRes.statusText)
    /* Pass on the successful response */
    const json = await takeshapeRes.json()
    if (json.errors) throw json.errors
    return res.status(200).json(json)
  } catch (error) {
    console.error(error)
    return res.status(error.status).json({
      status: error.status,
      message: JSON.stringify(error.message),
    })
  }
}

export default async (req, res) => {
  return getTakeShapeData(req, res, homePageQuery)
}
