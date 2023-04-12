import httpStatus from 'http-status'
import NotFound from 'payload/dist/errors/NotFound'
import getErrorHandler from 'payload/dist/express/middleware/errorHandler'
import graphQLHandler from 'payload/dist/graphql/graphQLHandler'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import i18n from '@payloadcms/next-payload/middleware/i18n'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  try {
    req.payloadAPI = 'GraphQL'

    if (req.method === 'POST') {
      return graphQLHandler(req, res)(req, res)
    }

    if (req.method === 'OPTIONS') {
      res.status(httpStatus.OK)
    }
  } catch (error) {
    const errorHandler = getErrorHandler(req.payload.config, req.payload.logger)
    return errorHandler(error, req, res, () => null)
  }

  return res.status(httpStatus.NOT_FOUND).json(new NotFound(req.t))
}

export default withPayload(
  withDataLoader(i18n(initializePassport(authenticate(handler))))
)

export const config = {
  api: {
    externalResolver: true,
  },
}
