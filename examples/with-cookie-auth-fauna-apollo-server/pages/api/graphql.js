import { ApolloServer } from 'apollo-server-micro'
import cookies from '../../lib/cookieHelper'
import schema from '../../lib/graphql/schema'

const apolloServer = new ApolloServer({
  schema,
  context(ctx) {
    return ctx
  },
  introspection: !(process.env.NODE_ENV === 'production'),
  playground: !(process.env.NODE_ENV === 'production'),
})

export const config = {
  api: {
    bodyParser: false,
  },
}

const handler = apolloServer.createHandler({ path: '/api/graphql' })

export default cookies(handler)
