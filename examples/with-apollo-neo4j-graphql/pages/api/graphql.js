import { ApolloServer } from 'apollo-server-micro'
import schema from '../../apollo/schema'
import getDriver from '../../util/neo4j'

const driver = getDriver()

const apolloServer = new ApolloServer({
  schema,
  introspection: true,
  playground: true,
  context: async (ctx) => {
    return {
      driver,
      ...ctx,
    }
  },
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default apolloServer.createHandler({ path: '/api/graphql' })
