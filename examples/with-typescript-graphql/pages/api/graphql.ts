import { ApolloServer } from 'apollo-server-express'
import { schema } from '../../lib/schema'

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

const apolloServer = new ApolloServer({ schema })
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
