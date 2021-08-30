import { superTokensNextWrapper } from 'supertokens-node/nextjs'
import { verifySession } from 'supertokens-node/recipe/session'
import supertokens from 'supertokens-node'
import * as SuperTokensConfig from '../../config/supertokensConfig'

supertokens.init(SuperTokensConfig.backendConfig())

export default async function user(req, res) {
  await superTokensNextWrapper(
    async (next) => {
      return await verifySession()(req, res, next)
    },
    req,
    res
  )

  return res.json({
    note: 'Fetch any data from your application for authenticated user after using verifySession middleware',
    userId: req.session.getUserId(),
    sessionHandle: req.session.getHandle(),
    userDataInJWT: req.session.getJWTPayload(),
  })
}
