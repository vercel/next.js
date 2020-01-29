const { ApolloServer, gql } = require('apollo-server-micro')
const { buildFederatedSchema } = require('@apollo/federation')

const typeDefs = gql`
  type Review @key(fields: "id") {
    id: ID!
    body: String
    author: User @provides(fields: "username")
    product: Product
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    username: String @external
    reviews: [Review]
  }

  extend type Product @key(fields: "upc") {
    upc: String! @external
    reviews: [Review]
  }
`

const resolvers = {
  Review: {
    author(review) {
      return { __typename: 'User', id: review.authorID }
    },
  },
  User: {
    reviews(user) {
      return reviews.filter(review => review.authorID === user.id)
    },
    numberOfReviews(user) {
      return reviews.filter(review => review.authorID === user.id).length
    },
    username(user) {
      const found = usernames.find(username => username.id === user.id)
      return found ? found.username : null
    },
  },
  Product: {
    reviews(product) {
      return reviews.filter(review => review.product.upc === product.upc)
    },
  },
}

const server = new ApolloServer({
  schema: buildFederatedSchema([
    {
      typeDefs,
      resolvers,
    },
  ]),
  introspection: true,
  playground: true,
})

export default server.createHandler({ path: '/api/reviews' })

export const config = {
  api: {
    bodyParser: false,
  },
}

const usernames = [
  { id: '1', username: '@ada' },
  { id: '2', username: '@complete' },
]
const reviews = [
  {
    id: '1',
    authorID: '1',
    product: { upc: '1' },
    body: 'Love it!',
  },
  {
    id: '2',
    authorID: '1',
    product: { upc: '2' },
    body: 'Too expensive.',
  },
  {
    id: '3',
    authorID: '2',
    product: { upc: '3' },
    body: 'Could be better.',
  },
  {
    id: '4',
    authorID: '2',
    product: { upc: '1' },
    body: 'Prefer something else.',
  },
]
