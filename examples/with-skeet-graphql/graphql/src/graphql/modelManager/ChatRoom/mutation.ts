import { extendType, stringArg, intArg, floatArg, booleanArg } from 'nexus'
import { toPrismaId } from '@skeet-framework/utils'
import { ChatRoom } from 'nexus-prisma'
import { PrismaClient } from '@prisma/client'
import { CurrentUser } from '@/index'
import { GraphQLError } from 'graphql'

export const ChatRoomMutation = extendType({
  type: 'Mutation',
  definition(t) {
    t.field('createChatRoom', {
      type: ChatRoom.$name,
      args: {
        name: stringArg(),
        title: stringArg(),
        model: stringArg(),
        maxTokens: intArg(),
        temperature: intArg(),
        stream: booleanArg(),
        systemContent: stringArg(),
      },
      async resolve(
        _,
        { name, title, model, maxTokens, temperature, stream, systemContent },
        ctx
      ) {
        try {
          const data = {
            name: name || 'default room',
            title,
            model: model || 'gpt-3.5-turbo',
            maxTokens: maxTokens || 420,
            temperature: temperature || 0,
            stream: !!stream,
          }
          const user: CurrentUser = ctx.user
          console.log({ user: user.id })
          if (user.id === '') throw new Error('You are not logged in!')
          const prismaClient = ctx.prisma as PrismaClient
          const result = await prismaClient.$transaction(async (tx) => {
            const userId = toPrismaId(user.id)
            // ChatRoomを作成
            const createdChatRoom = await tx.chatRoom.create({
              data,
            })

            // UserChatRoomに関連付けを作成
            await tx.userChatRoom.create({
              data: {
                userId,
                chatRoomId: createdChatRoom.id,
              },
            })

            // ChatRoomMessageを作成
            await tx.chatRoomMessage.create({
              data: {
                role: 'system',
                content:
                  systemContent ||
                  'This is a great chatbot. This Assistant is very kind and helpful.',
                userId,
                chatRoomId: createdChatRoom.id,
              },
            })

            return createdChatRoom
          })
          return result
        } catch (error) {
          throw new GraphQLError(`${error}`)
        }
      },
    })
    t.field('updateChatRoom', {
      type: ChatRoom.$name,
      args: {
        id: stringArg(),
        name: stringArg(),
        title: stringArg(),
        model: stringArg(),
        stream: booleanArg(),
      },
      async resolve(_, args, ctx) {
        try {
          if (!args.id) throw new Error(`no id`)
          const id = toPrismaId(args.id)
          const data = JSON.parse(JSON.stringify(args))
          delete data.id
          return await ctx.prisma.chatRoom.update({
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
    t.field('deleteChatRoom', {
      type: ChatRoom.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.chatRoom.delete({
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
