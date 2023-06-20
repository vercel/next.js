import { gql } from '@apollo/client'

export default gql`
  type Movie {
    title: String
    tagline: String
    released: Int
    actors: [Person!]! @relationship(type: "ACTED_IN", direction: IN)
    directors: [Person!]! @relationship(type: "DIRECTED", direction: IN)
  }

  type Person {
    name: String
    born: Int
    movies: [Movie!]! @relationship(type: "ACTED_IN", direction: OUT)
  }
`
