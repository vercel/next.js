interface Person {
  name: string
  born: number
  movies: Movies
}

interface Movie {
  title: string
  tagline: string
  released: number
  actors: Actors
  directors: Directors
}

export type Movies = Partial<Movie>[]

export type Actors = Partial<Person>[]

export type Directors = Partial<Person>[]
