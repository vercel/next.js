import refresh from 'payload/dist/auth/operations/refresh'
import getExtractJWT from 'payload/dist/auth/getExtractJWT'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import convertPayloadJSONBody from '@payloadcms/next-payload/middleware/convertPayloadJSONBody'
import fileUpload from '@payloadcms/next-payload/middleware/fileUpload'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'
import withCookie from '@payloadcms/next-payload/middleware/cookie'

async function handler(req, res) {
  try {
    let token

    const extractJWT = getExtractJWT(req.payload.config)
    token = extractJWT(req)

    if (req.body.token) {
      token = req.body.token
    }

    const result = await refresh({
      req,
      res,
      collection: req.payload.collections[req.query.collection],
      token,
    })

    return res.status(200).json({
      message: 'Token refresh successful',
      ...result,
    })
  } catch (error) {
    const errorHandler = getErrorHandler(req.payload.config, req.payload.logger)
    return errorHandler(error, req, res, () => null)
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default withPayload(
  withDataLoader(fileUpload(convertPayloadJSONBody(withCookie(handler))))
)
