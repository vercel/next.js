import gql from 'graphql-tag'

export const FIND_MOVIES = gql`
  query FindMovies($query: MovieQueryInput) {
    movies(query: $query) {
      title
      year
      runtime
    }
  }
`
