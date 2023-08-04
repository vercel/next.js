import { extendType, stringArg } from 'nexus'
import { connectionFromArray } from 'graphql-relay'
import { User } from 'nexus-prisma'
import { toPrismaId } from '@skeet-framework/utils'

export const UsersQuery = extendType({
  type: 'Query',
  definition(t) {
    t.connectionField('userConnection', {
      type: User.$name,
      async resolve(_, args, ctx, info) {
        return connectionFromArray(await ctx.prisma.user.findMany(), args)
      },
      extendConnection(t) {
        t.int('totalCount', {
          async resolve(source, args, ctx) {
            return ctx.prisma.user.count()
          },
        })
      },
    })
    t.field('getUser', {
      type: User.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.user.findUnique({
            where: {
              id: toPrismaId(id),
            },
          })
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
  },
})
