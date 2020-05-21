import { ApolloServer } from 'apollo-server-micro'
import schema from '../../lib/schema'
import { createResolverContext } from '../../lib/with-apollo'

const apolloServer = new ApolloServer({
  schema,
  context: createResolverContext,
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default apolloServer.createHandler({ path: '/api/graphql' })
