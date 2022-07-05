import { makeExecutableSchema } from '@graphql-tools/schema'
import { ApolloServer, gql, Config } from 'apollo-server-micro'
import { PageConfig, NextApiRequest, NextApiResponse } from 'next'

const typeDefs: Config['typeDefs'] = gql`
  type Query {
    users: [User!]!
    user(username: String): User
  }
  type User {
    name: String
    username: String
  }
`

const users = [
  { name: 'Leeroy Jenkins', username: 'leeroy' },
  { name: 'Foo Bar', username: 'foobar' },
]

const resolvers: Config['resolvers'] = {
  Query: {
    users() {
      return users
    },
    user(_parent, { username }) {
      return users.find((user) => user.username === username)
    },
  },
}

export const schema = makeExecutableSchema({ typeDefs, resolvers })

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
})

const startServer = apolloServer.start()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await startServer
  await apolloServer.createHandler({
    path: '/api/graphql',
  })(req, res)
}

export const config: PageConfig = {
  api: {
    bodyParser: false,
  },
}
