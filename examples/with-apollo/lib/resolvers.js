import { getData } from './data'

export const resolvers = {
  Query: {
    allPosts(_parent, _args, _context, _info) {
      const { first, skip } = _info.variableValues
      const slice = getData().allPosts.slice(skip, skip + first)
      return slice
    },
    _allPostsMeta() {
      return {
        count: getData()._allPostsMeta.count,
        __typename: '_QueryMeta',
      }
    },
  },
}
