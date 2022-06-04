import { graphql } from 'relay-runtime'

export default graphql`
  query IssuesQuery($owner: String!, $name: String!, $first: Int!) {
    repository(name: $name, owner: $owner) {
      issues(first: $first, states: [OPEN], orderBy: { field: UPDATED_AT, direction: DESC }) {
        edges {
          node {
            number
            title
            url
          }
        }
      }
    }
  }
`
