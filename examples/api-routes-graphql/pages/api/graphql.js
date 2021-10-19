import { ApolloServer, gql } from 'apollo-server-express'

const typeDefs = gql`
  type Query {
    users: [User!]!
  }
  type User {
    name: String
  }
`

const resolvers = {
  Query: {
    users(parent, args, context) {
      return [{ name: 'Nextjs' }]
    },
  },
}

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

export default async function handler(req, res) {
  await runMiddleware(req, res, apolloMiddleware)
}

export const config = {
  api: {
    bodyParser: false,
  },
}
