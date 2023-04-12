import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import registerFirstUser from 'payload/dist/auth/operations/registerFirstUser'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import convertPayloadJSONBody from '@payloadcms/next-payload/middleware/convertPayloadJSONBody'
import fileUpload from '@payloadcms/next-payload/middleware/fileUpload'
import withCookies from '@payloadcms/next-payload/middleware/cookie'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  try {
    const firstUser = await registerFirstUser({
      req,
      res,
      collection: req.payload.collections[req.query.collection],
      data: req.body,
    })

    return res.status(200).json(firstUser)
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
  withDataLoader(fileUpload(withCookies(convertPayloadJSONBody(handler))))
)
