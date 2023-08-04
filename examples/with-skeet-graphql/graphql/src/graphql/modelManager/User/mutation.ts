import { Prisma } from '@prisma/client'
import { generateIv, toPrismaId } from '@skeet-framework/utils'
import { objectType, stringArg } from 'nexus'
import { User } from 'nexus-prisma'

export const UserMutation = objectType({
  name: 'Mutation',
  definition(t) {
    t.field('createUser', {
      type: User.$name,
      args: {
        uid: stringArg(),
        username: stringArg(),
        email: stringArg(),
        iconUrl: stringArg(),
      },
      async resolve(_, args, ctx) {
        try {
          if (!args.uid || !args.email) throw new Error(`no uid or email`)
          const { uid, username, email, iconUrl } = args
          const userParams: Prisma.UserCreateInput = {
            uid: uid,
            username,
            email: email,
            iconUrl,
            iv: generateIv(),
          }
          return await ctx.prisma.user.create({
            data: userParams,
          })
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
    t.field('updateUser', {
      type: User.$name,
      args: {
        id: stringArg(),
        uid: stringArg(),
        username: stringArg(),
        email: stringArg(),
        iconUrl: stringArg(),
      },
      async resolve(_, { id, username, iconUrl }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.user.update({
            where: {
              id: toPrismaId(id),
            },
            data: {
              username,
              iconUrl,
            },
          })
        } catch (error) {
          console.log(error)
          throw new Error(`error: ${error}`)
        }
      },
    })
    t.field('deleteUser', {
      type: User.$name,
      args: {
        id: stringArg(),
      },
      async resolve(_, { id }, ctx) {
        try {
          if (!id) throw new Error(`no id`)
          return await ctx.prisma.user.delete({
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
