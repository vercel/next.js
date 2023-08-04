import { extendType, stringArg, intArg } from 'nexus'
import { toPrismaId } from '@skeet-framework/utils'
import { UserChatRoom } from 'nexus-prisma'

export const UserChatRoomMutation = extendType({
  type: 'Mutation',
  definition(t) {
    t.field('createUserChatRoom', {
      type: UserChatRoom.$name,
      args: {
        userId: intArg(),
        chatRoomId: intArg(),
      },
      async resolve(_, args, ctx) {
        try {
          if (!args.userId || !args.chatRoomId)
            throw new Error(`not enough args`)
          return await ctx.prisma.userChatRoom.create({
            data: args,
          })
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
    t.field('updateUserChatRoom', {
      type: UserChatRoom.$name,
      args: {
        id: stringArg(),
        chatRoomId: intArg(),
      },
      async resolve(_, args, ctx) {
        try {
          if (!args.id) throw new Error(`no id`)
          const id = toPrismaId(args.id)
          const data = JSON.parse(JSON.stringify(args))
          delete data.id
          return await ctx.prisma.userChatRoom.update({
            where: {
              id,
            },
            data,
          })
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
    t.field('deleteUserChatRoom', {
      type: UserChatRoom.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.userChatRoom.delete({
            where: {
              id: toPrismaId(id),
            },
          })
        } catch (error) {
          throw new Error(`error: ${error}`)
        }
      },
    })
  },
})
