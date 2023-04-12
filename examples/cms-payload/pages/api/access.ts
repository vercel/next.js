import authenticate from '@payloadcms/next-payload/middleware/authenticate'
import initializePassport from '@payloadcms/next-payload/middleware/initializePassport'
import withPayload from '@payloadcms/next-payload/middleware/withPayload'
import access from 'payload/dist/auth/operations/access'

async function handler(req, res) {
  const accessResult = await access({
    req,
  })

  return res.status(200).json(accessResult)
}

export default withPayload(initializePassport(authenticate(handler)))

export const config = {
  api: {
    externalResolver: true,
  },
}
