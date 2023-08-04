import { extendType, stringArg, intArg } from 'nexus'
import { toPrismaId } from '@skeet-framework/utils'
import { ChatRoomMessage } from 'nexus-prisma'
import { CurrentUser } from '@/index'

export const ChatRoomMessageMutation = extendType({
  type: 'Mutation',
  definition(t) {
    t.field('createChatRoomMessage', {
      type: ChatRoomMessage.$name,
      args: {
        role: stringArg(),
        content: stringArg(),
        chatRoomId: stringArg(),
      },
      async resolve(_, { role, content, chatRoomId }, ctx) {
        try {
          const user: CurrentUser = ctx.user
          console.log(user)
          if (user.uid === '') throw new Error(`You are not logged in!`)
          if (!role || !content || !chatRoomId)
            throw new Error(`not enough args`)
          const data = {
            role,
            content,
            userId: toPrismaId(user.id),
            chatRoomId: toPrismaId(chatRoomId),
          }
          return await ctx.prisma.chatRoomMessage.create({
            data,
          })
        } catch (error) {
          console.log(error)
          throw new Error(`createChatRoomMessage: ${error}`)
        }
      },
    })
    t.field('updateChatRoomMessage', {
      type: ChatRoomMessage.$name,
      args: {
        id: stringArg(),
        content: stringArg(),
        userId: intArg(),
        chatRoomId: intArg(),
      },
      async resolve(_, args, ctx) {
        try {
          if (!args.id) throw new Error(`no id`)
          const id = toPrismaId(args.id)
          const data = JSON.parse(JSON.stringify(args))
          delete data.id
          return await ctx.prisma.chatRoomMessage.update({
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
    t.field('deleteChatRoomMessage', {
      type: ChatRoomMessage.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.chatRoomMessage.delete({
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
