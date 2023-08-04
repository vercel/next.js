import { not, rule, shield } from 'graphql-shield'
import { GraphQLError } from 'graphql'

const isAuthenticated = rule({ cache: 'contextual' })(
  async (_parent, _args, ctx) => {
    return ctx.user?.uid !== ''
  }
)

const isAdmin = rule()(async (parent, args, ctx, info) => {
  return ctx.user.role === 'ADMIN'
})

const isGm = rule()(async (parent, args, ctx, info) => {
  return ctx.user.role === 'GM'
})

export const permissions = shield(
  {
    Query: {
      me: isAuthenticated,
      userConnection: isAuthenticated,
    },
    Mutation: {},
  },
  {
    fallbackError: async (thrownThing) => {
      console.log(thrownThing)
      if (thrownThing instanceof GraphQLError) {
        return thrownThing
      } else if (thrownThing instanceof Error) {
        return new GraphQLError('Internal server error')
      } else {
        return new GraphQLError('Not Authorized')
      }
    },
  }
)
