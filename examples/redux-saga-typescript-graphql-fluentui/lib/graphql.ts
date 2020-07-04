import { GraphQLClient } from 'graphql-request'

import { Env } from '../constants'
const API_GATEWAY_ENTRYPOINT = `${Env.API_GATEWAY_ENTRYPOINT}/graphql`

console.log('endpint url', API_GATEWAY_ENTRYPOINT)
export const graphQLClient = new GraphQLClient(API_GATEWAY_ENTRYPOINT, {
  headers: {
    //   authorization: 'Bearer MY_TOKEN',
  },
})
