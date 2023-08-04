import { toPrismaId } from '@skeet-framework/utils'
import { extendType } from 'nexus'
import { User } from 'nexus-prisma'

export const MeQuery = extendType({
  type: 'Query',
  definition(t) {
    t.field('me', {
      type: User.$name,
      args: {},
      async resolve(_, __, ctx) {
        if (!ctx.user.id || ctx.user.id == '') {
          return {
            uid: '',
            username: '',
            iconUrl: '',
            email: '',
          }
        }
        return await ctx.prisma.user.findUnique({
          where: {
            id:
              process.env.NODE_ENV === 'production'
                ? toPrismaId(ctx.user.id)
                : 1,
          },
        })
      },
    })
  },
})
