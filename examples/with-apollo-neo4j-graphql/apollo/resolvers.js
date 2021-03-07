import { neo4jgraphql } from 'neo4j-graphql-js'

export default {
  Query: {
    getMovies: neo4jgraphql,
    getMovie: neo4jgraphql,
    getActor: neo4jgraphql,
}
