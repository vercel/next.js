import { ApolloServer, gql } from 'apollo-server-micro'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Photon } from '@generated/photon'

const photon = new Photon()

const JWT_SECRET = 'PleaseUseBetterStorageForThisSecret'

const getUserId = (req) => {
  const Authorization = req.headers && req.headers.authorization || ''
  if (Authorization) {
    const token = Authorization.replace('Bearer ', '')
    const verifiedToken = jwt.verify(token, JWT_SECRET)
    return verifiedToken.userId
  }
}

const typeDefs = gql`
  type Query {
    me: User!
  }
  type Mutation {
    register(email: String, name: String, password: String): AuthPayload!
    login(email: String, password: String): AuthPayload!
  }
  type AuthPayload {
    token: String
  }
  type User {
    id: String
    name: String
    email: String
  }
`

const resolvers = {
  Query: {
    async me (parent, args, context) {
      const id = context.user
      const user = await context.photon.users.findOne({ where: { id } }).then(user => user)

      if (!user) throw new Error('No such user found.')

      return { ...user }
    }
  },
  Mutation: {
    async register (parent, { email, name, password }, context) {
      const hashedPassword = await bcrypt.hash(password, 10)

      const user = await context.photon.users.create({
        data: {
          email,
          name,
          password: hashedPassword
        }
      }).then(user => user)

      if (!user) throw new Error('No such user found.')

      const token = jwt.sign({
        userId: user.id
      }, JWT_SECRET)

      return { token }
    },
    async login (parent, { email, password }, context) {
      const user = await context.photon.users.findOne({ where: { email } }).then(user => user)

      if (!user) throw new Error('No such user found.')

      const valid = await bcrypt.compare(password, user.password)

      if (valid) {
        const token = jwt.sign({
          userId: user.id
        }, JWT_SECRET)

        return { token }
      } else {
        throw new Error('Invalid password.')
      }
    }
  }
}

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    const user = getUserId(req)
    return { req, user, photon }
  }
})

export const config = {
  api: {
    bodyParser: false
  }
}

export default apolloServer.createHandler({ path: '/api/graphql' })
