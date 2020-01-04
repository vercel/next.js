import { makeExecutableSchema } from 'graphql-tools'
import typeDefs from './type-defs.graphqls'
import resolvers from './resolvers'

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
})

export default schema
