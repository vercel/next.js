import { GraphQLClient } from 'graphql-request'

const API_GATEWAY_ENTRYPOINT = `${
  process.env.API_GATEWAY_ENTRYPOINT || 'http://localhost:9000'
}/graphql`

export const graphQLClient = new GraphQLClient(API_GATEWAY_ENTRYPOINT, {
  headers: {
    //   authorization: 'Bearer MY_TOKEN',
  },
})
