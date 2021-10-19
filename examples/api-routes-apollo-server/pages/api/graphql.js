import { ApolloServer, gql } from 'apollo-server-express'
import { makeExecutableSchema } from '@graphql-tools/schema'

const typeDefs = gql`
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

const resolvers = {
  Query: {
    users() {
      return users
    },
    user(parent, { username }) {
      return users.find((user) => user.username === username)
    },
  },
}

export const schema = makeExecutableSchema({ typeDefs, resolvers })

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result)
      }

      return resolve(result)
    })
  })
}

const apolloServer = new ApolloServer({ typeDefs, resolvers })
await apolloServer.start()
const apolloMiddleware = apolloServer.getMiddleware({
  path: '/api/graphql',
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  await runMiddleware(req, res, apolloMiddleware)
}
