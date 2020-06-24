import gql from 'graphql-tag'

export const FIND_MOVIE = gql`
  query FindMovie($query: MovieQueryInput!) {
    movie(query: $query) {
      _id
      title
      year
      runtime
      rated
      poster
      imdb
    }
  }
`

export const FIND_MOVIES = gql`
  query FindMovies($query: MovieQueryInput) {
    movies(query: $query) {
      title
      year
      runtime
    }
  }
`
