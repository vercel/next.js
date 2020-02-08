import { AuthenticationError, UserInputError } from 'apollo-server-micro'
import cookie from 'cookie'
import jwt from 'jsonwebtoken'
import getConfig from 'next/config'
import bcrypt from 'bcrypt'
import v4 from 'uuid/v4'

const JWT_SECRET = getConfig().serverRuntimeConfig.JWT_SECRET

const users = []

function createUser(data) {
  const salt = bcrypt.genSaltSync()

  return {
    id: v4(),
    email: data.email,
    hashedPassword: bcrypt.hashSync(data.password, salt),
  }
}

function validPassword(user, password) {
  return bcrypt.compareSync(password, user.hashedPassword)
}

export const resolvers = {
  Query: {
    async viewer(_parent, _args, context, _info) {
      const { token } = cookie.parse(context.req.headers.cookie ?? '')
      if (token) {
        try {
          const { id, email } = jwt.verify(token, JWT_SECRET)

          return users.find(user => user.id === id && user.email === email)
        } catch {
          throw new AuthenticationError(
            'Authentication token is invalid, please log in'
          )
        }
      }
    },
  },
  Mutation: {
    async signUp(_parent, args, _context, _info) {
      const user = createUser(args.input)

      users.push(user)

      return { user }
    },

    async signIn(_parent, args, context, _info) {
      const user = users.find(user => user.email === args.input.email)

      if (user && validPassword(user, args.input.password)) {
        const token = jwt.sign(
          { email: user.email, id: user.id, time: new Date() },
          JWT_SECRET,
          {
            expiresIn: '6h',
          }
        )

        context.res.setHeader(
          'Set-Cookie',
          cookie.serialize('token', token, {
            httpOnly: true,
            maxAge: 6 * 60 * 60,
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          })
        )

        return { user }
      }

      throw new UserInputError('Invalid email and password combination')
    },
    async signOut(_parent, _args, context, _info) {
      context.res.setHeader(
        'Set-Cookie',
        cookie.serialize('token', '', {
          httpOnly: true,
          maxAge: -1,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
      )

      return true
    },
  },
}
