import { gql } from '@apollo/client'

export default gql`
  type Movie {
    title: String
    tagline: String
    released: String
    actors: [Person] @relation(name: "ACTED_IN", direction: "IN")
    directors: [Person] @relation(name: "DIRECTED", direction: "IN")
  }

  type Person {
    name: String
    born: Int
    movies: [Movie] @relation(name: "ACTED_IN", direction: "OUT")
  }

  type Query {
    getMovies: [Movie]
    getMovie: Movie
    getActor: Person
  }
`
