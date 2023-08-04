import { extendType, stringArg } from 'nexus'
import { toPrismaId, connectionFromArray } from '@skeet-framework/utils'
import { ChatRoom } from 'nexus-prisma'
import { CurrentUser } from '@/index'
import { UserChatRoom } from '@prisma/client'

export const ChatRoomsQuery = extendType({
  type: 'Query',
  definition(t) {
    t.connectionField('chatRoomConnection', {
      type: ChatRoom.$name,
      async resolve(_, args, ctx, info) {
        const user: CurrentUser = ctx.user
        const userChatRooms = await ctx.prisma.userChatRoom.findMany({
          where: {
            userId: toPrismaId(user.id),
          },
        })
        const chatRoomIds = userChatRooms.map(
          (userChatRoom: UserChatRoom) => userChatRoom.chatRoomId
        )
        return connectionFromArray(
          await ctx.prisma.chatRoom.findMany({
            where: {
              id: {
                in: chatRoomIds,
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          }),
          args
        )
      },
      extendConnection(t) {
        t.int('totalCount', {
          async resolve(source, args, ctx) {
            return ctx.prisma.chatRoom.count()
          },
        })
      },
    })
    t.field('getChatRoom', {
      type: ChatRoom.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.chatRoom.findUnique({
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
