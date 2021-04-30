import Boom from '@hapi/boom'

export default function errorResponse(res, error) {
  if (!Boom.isBoom(error)) {
    return res.status(400)
  }

  const { output } = error
  return res.status(output.statusCode).json(output.payload)
}
