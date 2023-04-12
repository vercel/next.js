import graphQLPlayground from 'graphql-playground-middleware-express'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'

async function handler(req, res) {
  return graphQLPlayground({
    endpoint: `${req.payload.config.routes.api}${req.payload.config.routes.graphQL}`,
    settings: {
      'request.credentials': 'include',
    },
  })(req, res, () => null)
}

export default withPayload(handler)

export const config = {
  api: {
    externalResolver: true,
  },
}
