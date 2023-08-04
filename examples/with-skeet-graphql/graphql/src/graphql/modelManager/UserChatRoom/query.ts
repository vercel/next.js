import { extendType, stringArg } from 'nexus'
import { toPrismaId, connectionFromArray } from '@skeet-framework/utils'
import { UserChatRoom } from 'nexus-prisma'

export const UserChatRoomsQuery = extendType({
  type: 'Query',
  definition(t) {
    t.connectionField('userChatRoomConnection', {
      type: UserChatRoom.$name,
      async resolve(_, args, ctx, info) {
        return connectionFromArray(
          await ctx.prisma.userChatRoom.findMany(),
          args
        )
      },
      extendConnection(t) {
        t.int('totalCount', {
          async resolve(source, args, ctx) {
            return ctx.prisma.userChatRoom.count()
          },
        })
      },
    })
    t.field('getUserChatRoom', {
      type: UserChatRoom.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.userChatRoom.findUnique({
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
