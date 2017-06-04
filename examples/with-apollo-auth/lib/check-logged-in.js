import gql from 'graphql-tag';

export default (context, apolloClient) => (
  apolloClient.query({
    query: gql`
      query getUser {
        user {
          id
          name
        }
      }
    `
  }).then(({ data }) => {
    return { loggedInUser: data };
  }).catch((error) => {
    // Fail gracefully
    return { loggedInUser: {} };
  })
);
