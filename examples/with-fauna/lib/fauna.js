import { GraphQLClient, gql } from 'graphql-request'

const FAUNADB_GRAPHQL_ENDPOINT = 'https://graphql.fauna.com/graphql'
const FAUNADB_SECRET = process.env.FAUNADB_SECRET

const graphQLClient = new GraphQLClient(FAUNADB_GRAPHQL_ENDPOINT, {
  headers: {
    authorization: `Bearer ${FAUNADB_SECRET}`,
  },
})

export const listGuestbookEntries = () => {
  const query = gql`
    query Entries($size: Int) {
      entries(_size: $size) {
        data {
          _id
          _ts
          name
          message
          createdAt
        }
      }
    }
  `

  return graphQLClient
    .request(query, { size: 999 })
    .then(({ entries: { data } }) => data)
}

export const createGuestbookEntry = (newEntry) => {
  const mutation = gql`
    mutation CreateGuestbookEntry($input: GuestbookEntryInput!) {
      createGuestbookEntry(data: $input) {
        _id
        _ts
        name
        message
        createdAt
      }
    }
  `

  return graphQLClient.request(mutation, { input: newEntry })
}
