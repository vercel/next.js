import httpStatus from 'http-status'
import logout from 'payload/dist/auth/operations/logout'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import convertPayloadJSONBody from '@payloadcms/next-payload/middleware/convertPayloadJSONBody'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import withCookie from '@payloadcms/next-payload/middleware/cookie'

async function handler(req, res) {
  try {
    const message = await logout({
      collection: req.payload.collections[req.query.collection],
      res,
      req,
    })

    return res.status(httpStatus.OK).json({ message })
  } catch (error) {
    const errorHandler = getErrorHandler(req.payload.config, req.payload.logger)
    return errorHandler(error, req, res, () => null)
  }
}

export default withPayload(
  convertPayloadJSONBody(initializePassport(authenticate(withCookie(handler))))
)

export const config = {
  api: {
    externalResolver: true,
  },
}
