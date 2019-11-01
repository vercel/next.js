import gql from 'graphql-tag'

export default apolloClient =>
  apolloClient
    .query({
      query: gql`
        query me {
          me {
            id
            name
          }
        }
      `
    })
    .then(({ data }) => {
      return { ...data }
    })
    .catch(e => {
      // Fail gracefully
      return {}
    })
