import { extendType, stringArg } from 'nexus'

export const postTweet = extendType({
  type: 'Query',
  definition(t) {
    t.field('postTweet', {
      type: 'Boolean',
      args: {
        id: stringArg(),
        text: stringArg(),
      },
      async resolve(_, { id, text }, ctx) {
        try {
          if (!id || !text) throw new Error(`no id`)
          return true
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
  },
})
