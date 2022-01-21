import { ApolloServer } from 'apollo-server-micro'
import { ApolloServerPluginLandingPageGraphQLPlayground } from 'apollo-server-core'
import { schema } from '../../lib/schema'
import { MicroRequest } from 'apollo-server-micro/dist/types'
import ServerResponse from 'http'

const apolloServer = new ApolloServer({
  schema,
  plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
})

export const config = {
  api: {
    bodyParser: false,
  },
}

const serverStarted = apolloServer.start()

const handler = async (
  req: MicroRequest,
  res: ServerResponse.ServerResponse
) => {
  await serverStarted
  await apolloServer.createHandler({ path: '/api/graphql' })(req, res)
}

export default handler
