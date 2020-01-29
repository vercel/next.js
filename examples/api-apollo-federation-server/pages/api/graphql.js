const { ApolloServer } = require('apollo-server-micro')
const { ApolloGateway } = require('@apollo/gateway')
const api = process.env.BACKEND_API

const gateway = new ApolloGateway({
  serviceList: [
    {
      name: 'accounts',
      url: `${api}/api/accounts`,
    },
    {
      name: 'reviews',
      url: `${api}/api/reviews`,
    },
    {
      name: `products`,
      url: `${api}/api/products`,
    },
    {
      name: `inventory`,
      url: `${api}/api/inventory`,
    },
  ],
  debug: true,
})

const server = new ApolloServer({
  gateway,
  subscriptions: false,
  introspection: true,
  playground: true,
})

export default server.createHandler({ path: '/api/graphql' })

export const config = {
  api: {
    bodyParser: false,
  },
}
