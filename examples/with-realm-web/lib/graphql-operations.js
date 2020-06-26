export const FIND_MOVIES = `
  query FindMovies{
    movies(query: { year: 2014, rated: "PG" } ) {
      title
      year
      runtime
    }
  }
`
