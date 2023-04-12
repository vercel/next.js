import { docAccess } from 'payload/dist/collections/operations/docAccess'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  try {
    const docAccessResult = await docAccess({
      id: req.query.id,
      req: {
        ...req,
        collection: req.payload.collections[req.query.collection],
      },
    })
    return res.status(200).json(docAccessResult)
  } catch (error) {
    const errorHandler = getErrorHandler(req.payload.config, req.payload.logger)
    return errorHandler(error, req, res, () => null)
  }
}

export default withPayload(
  withDataLoader(initializePassport(authenticate(handler)))
)

export const config = {
  api: {
    externalResolver: true,
  },
}
