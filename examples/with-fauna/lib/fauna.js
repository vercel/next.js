import { GraphQLClient, gql } from 'graphql-request'

const graphQLClient = new GraphQLClient('https://graphql.fauna.com/graphql', {
  headers: {
    authorization: `Bearer ${process.env.FAUNA_ADMIN_KEY}`,
  },
})

export const getGuestbookEntry = (id) => {
  const query = gql`
    query Entries($id: Int) {
      entries(id: $id) {
        data {
          _id
          _ts
          email
          body
          created_by
          updated_at
        }
      }
    }
  `

  return graphQLClient.request(query, { size: 100 })
}

export const getAllGuestbookEntries = () => {
  const query = gql`
    query Entries($size: Int) {
      entries(_size: $size) {
        data {
          _id
          _ts
          email
          body
          created_by
          updated_at
        }
      }
    }
  `

  return graphQLClient.request(query, { size: 100 })
}

export const createGuestbookEntry = async (newEntry) => {
  const mutation = gql`
    mutation CreateGuestbookEntry($twitterHandle: String!, $story: String!) {
      createGuestbookEntry(
        data: {
          email: $email
          body: $body
          created_by: $created_by
          updated_at: $updated_at
        }
      ) {
        _id
        _ts
        email
        body
        created_by
        updated_at
      }
    }
  `

  return graphQLClient.request(mutation, newEntry)
}

export const updateGuestbookEntry = async (updatedEntry) => {
  const mutation = gql`TODO`

  return graphQLClient.request(mutation, updatedEntry)
}

export const deleteGuestbookEntry = async (id) => {
  const mutation = gql`
    mutation DeleteGuestbookEntry($id: Int!) {
      deleteGuestbookEntry(data: { id: $id })
    }
  `

  return graphQLClient.request(mutation, { id })
}
