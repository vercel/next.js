import { ApolloServer, gql, makeExecutableSchema } from 'apollo-server-micro'

const typeDefs = gql`
  type Query {
    users: [User!]!
    user(username: String): User
  }
  type User {
    name: String
    username: String
  }
`
const users = [
  { name: 'Leeroy Jenkins', username: 'leeroy' },
  { name: 'Foo Bar', username: 'foobar' },
]

const resolvers = {
  Query: {
    users() {
      return users
    },
    user(parent, { username }) {
      return users.find((user) => user.username === username)
    },
  },
}

export const schema = makeExecutableSchema({ typeDefs, resolvers })

export const config = {
  api: {
    bodyParser: false,
  },
}

export default new ApolloServer({ schema }).createHandler({
  path: '/api/graphql',
})
