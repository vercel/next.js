import { INTERNAL_SERVER_ERROR, UNPROCESSABLE_ENTITY } from 'http-status-codes'
import ValidationError from 'mongoose/lib/error/validation'

/**
 * @param {ValidationError} error
 */
function transformValidationError(error) {
  const errors = Object.entries(error.errors).reduce(
    (prev, [key, value]) => ({ ...prev, [key]: value.message }),
    {}
  )

  return {
    statusCode: UNPROCESSABLE_ENTITY,
    errors,
  }
}

/**
 * Handle uncaught error
 *
 * @export
 * @param {Error|ValidationError} error
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
export function onError(error, req, res) {
  if (error instanceof ValidationError) {
    res.status(UNPROCESSABLE_ENTITY).json(transformValidationError(error))
  } else {
    console.error(`[${req.method}] ${req.url}`, error)

    res.status(INTERNAL_SERVER_ERROR).json({
      statusCode: INTERNAL_SERVER_ERROR,
      message: error.toString(),
    })
  }
}
