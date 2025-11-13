const express = require('express')
const { ApolloServer, gql } = require('apollo-server-express')

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  type Query {
    hello: String
  }
`

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    hello: () => 'Hello world!',
  },
}

async function startApolloServer(typeDefs, resolvers) {
  const server = new ApolloServer({ typeDefs, resolvers })
  const app = express()
  await server.start()
  server.applyMiddleware({ app, path: '/graphql' })
}

startApolloServer(typeDefs, resolvers).catch(console.error)
