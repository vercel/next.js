import { createYoga, createSchema } from 'graphql-yoga'

const typeDefs = /* GraphQL */ `
  type Query {
    users: [User!]!
  }
  type User {
    name: String
  }
`

const resolvers = {
  Query: {
    users() {
      return [{ name: 'Nextjs' }]
    },
  },
}

const schema = createSchema({
  typeDefs,
  resolvers,
})

export default createYoga({
  schema,
  // Needed to be defined explicitly because our endpoint lives at a different path other than `/graphql`
  graphqlEndpoint: '/api/graphql',
})
