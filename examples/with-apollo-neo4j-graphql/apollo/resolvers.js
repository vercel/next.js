import { neo4jgraphql } from 'neo4j-graphql-js'

export default {
  Query: {
    getMovies: (parent, args, context, resolveInfo) => {
      return neo4jgraphql(parent, args, context, resolveInfo)
    },
    getMovie: (parent, args, context, resolveInfo) => {
      return neo4jgraphql(parent, args, context, resolveInfo)
    },
    getActor: (parent, args, context, resolveInfo) => {
      return neo4jgraphql(parent, args, context, resolveInfo)
    },
  },
}
