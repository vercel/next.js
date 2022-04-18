import { createServer } from '@graphql-yoga/node'
import { readFileSync } from 'node:fs'

import resolvers from 'lib/resolvers'

const typeDefs = readFileSync('lib/schema.graphql', 'utf8')

const server = createServer({
  schema: {
    typeDefs,
    resolvers,
  },
  endpoint: '/api/graphql',
  // graphiql: false // uncomment to disable GraphiQL
})

export default server
