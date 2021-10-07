import gql from 'graphql-tag'

export const GET_LAUNCHES_LIST_QUERY = gql`
  query getLaunchesList {
    launches {
      id
      mission_name
      mission_id
    }
  }
`
