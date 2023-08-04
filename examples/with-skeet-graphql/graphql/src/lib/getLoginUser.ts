import { DecodedIdToken } from 'firebase-admin/lib/auth/token-verifier'
import { auth } from 'firebase-admin'
import { toGlobalId } from '@skeet-framework/utils'
import admin from 'firebase-admin'
import { PrismaClient } from '@prisma/client'
admin.initializeApp()

const skeetEnv = process.env.NODE_ENV || 'development'

export type UnknownUser = {
  id: string
  uid: string
  name: string
  email: string
  iconUrl: string
}

export const unknownUser: UnknownUser = {
  id: '',
  uid: '',
  name: '',
  email: '',
  iconUrl: '',
}

export const getLoginUser = async <T>(token: string, prisma: PrismaClient) => {
  if (token == 'undefined' || token == null) return unknownUser

  const bearer = token.split('Bearer ')[1]
  try {
    if (!bearer) return unknownUser
    const decodedUser: DecodedIdToken = await auth().verifyIdToken(bearer)
    const user = await prisma.user.findUnique({
      where: {
        uid: decodedUser.uid,
      },
    })
    if (!user) return unknownUser
    const response = { ...user, id: toGlobalId('User', user.id) } as T
    if (response) return response
    return response
  } catch (error) {
    if (skeetEnv === 'development') {
      const user = await prisma.user.findUnique({
        where: {
          id: 1,
        },
      })
      if (!user) return unknownUser
      console.log(`This is development mode - ctx.user returns user id: 1`)
      return { ...user, id: toGlobalId('User', 1) } as T
    }
    return unknownUser
  }
}
