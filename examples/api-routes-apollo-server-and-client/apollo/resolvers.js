export const resolvers = {
  Node: {
    __resolveType (obj, context, info) {}
  },
  Query: {
    allPosts (obj, args, context, info) {
      return []
    },
    _allPostsMeta (obj, args, context, info) {
      return { count: 0 }
    }
  }
}
