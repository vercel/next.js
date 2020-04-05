import { makeExecutableSchema } from 'graphql-tools'
import { typeDefs } from './typedefs'
import { resolvers } from './resolvers'

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
})
