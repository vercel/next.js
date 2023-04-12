import meOperation from 'payload/dist/auth/operations/me'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import withDataLoader from '@payloadcms/next-payload/middleware/dataLoader'

async function handler(req, res) {
  const collection = req.payload.collections[req.query.collection]
  const result = await meOperation({ req, collection })
  return res.status(200).json(result)
}

export default withPayload(
  withDataLoader(initializePassport(authenticate(handler)))
)

export const config = {
  api: {
    externalResolver: true,
  },
}
