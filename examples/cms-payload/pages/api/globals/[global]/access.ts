import { docAccess } from 'payload/dist/globals/operations/docAccess'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  const globalConfig = req.payload.globals.config.find(
    (global) => global.slug === req.query.global
  )

  try {
    const globalAccessResult = await docAccess({
      req,
      globalConfig,
    })
    return res.status(200).json(globalAccessResult)
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
