import { UserInputError } from 'apollo-server-micro'
import {
  SECRET_COOKIE_NAME,
  unsetCookieConfig,
  setCookieConfig,
} from '../fauna/config'

const createOverrideResolvers = (
  remoteExecutableSchema,
  localExecutableSchema
) => ({
  Mutation: {
    loginUser: async (root, args, context, info) => {
      console.log('OVERRIDE mutation loginUser')

      const { cookie: setCookie } = context.res

      if (!args.data || !args.data.email || !args.data.password) {
        throw new UserInputError('Missing input data', {
          invalidArgs: Object.keys(args),
        })
      }

      const validatedToken = await info.mergeInfo
        .delegateToSchema({
          schema: localExecutableSchema,
          operation: 'query',
          fieldName: 'validCookie',
          args,
          context,
          info,
        })
        .catch((error) => {
          console.log(
            'Query (validCookie) - Delegation to local schema failed --',
            error.message
          )
          return error
        })

      if (validatedToken) {
        return validatedToken
      }

      const data = await info.mergeInfo
        .delegateToSchema({
          schema: remoteExecutableSchema,
          operation: 'mutation',
          fieldName: 'loginUser',
          args,
          context,
          info,
        })
        .catch((error) => {
          console.log(
            'Mutation (loginUser) - Delegation to remote schema failed --',
            error.message
          )
          return error
        })
      if (data) {
        console.log('Setting custom cookie --', data)
        setCookie(SECRET_COOKIE_NAME, data, setCookieConfig)
        return data
      }
      console.log('Token returned is invalid --', data)
      console.log('Problem with schema delegation')
      return data
    },
    signupUser: async (root, args, context, info) => {
      console.log('OVERRIDE mutation signup')

      const { cookie: setCookie } = context.res

      if (
        !args.data ||
        !args.data.email ||
        !args.data.password ||
        !args.data.role
      ) {
        throw new UserInputError('Missing input data', {
          invalidArgs: Object.keys(args),
        })
      }

      const validatedToken = await info.mergeInfo
        .delegateToSchema({
          schema: localExecutableSchema,
          operation: 'query',
          fieldName: 'validCookie',
          args,
          context,
          info,
        })
        .catch((error) => {
          console.log(
            'Query (validCookie) - Delegation to local schema failed --',
            error.message
          )
          return error
        })

      if (validatedToken) {
        return validatedToken
      }

      const data = await info.mergeInfo
        .delegateToSchema({
          schema: remoteExecutableSchema,
          operation: 'mutation',
          fieldName: 'signupUser',
          args,
          context,
          info,
        })
        .catch((error) => {
          console.log(
            'Mutation (signupUser) - Delegation to remote schema failed --',
            error.message
          )
          return error
        })
      if (data) {
        console.log('Setting custom cookie --', data)
        setCookie(SECRET_COOKIE_NAME, data, setCookieConfig)
        return data
      }
      console.log('Token returned is invalid --', data)
      console.log('Problem with schema delegation')
      return data
    },
    logoutUser: async (root, args, context, info) => {
      console.log('OVERRIDE mutation logout')

      const { cookie: setCookie } = context.res

      // Logging out in Fauna means deleting any user specific ABAC tokens
      const data = await info.mergeInfo
        .delegateToSchema({
          schema: remoteExecutableSchema,
          operation: 'mutation',
          fieldName: 'logoutUser',
          args,
          context,
          info,
        })
        .catch((error) => {
          if (error.message === 'Invalid database secret.') {
            console.log('Already logged out -- Deleting cookie')
            setCookie(SECRET_COOKIE_NAME, '', unsetCookieConfig)
            return 'already logged out'
          }
          if (
            error.message === 'Insufficient privileges to perform the action.'
          ) {
            console.log(
              'Already logged out and using public token -- Cookie is already deleted'
            )
            return 'already logged out'
          }
          console.log("Couldn't log user out --", error.message)
          return error.message
        })
      if (data === 'already logged out') return true
      if (data === true) {
        console.log('Logout successful -- Deleting cookie')
        if (data) {
          setCookie(SECRET_COOKIE_NAME, '', unsetCookieConfig)
          return data
        }
      }
      console.log('Unexpected error')
      return data
    },
  },
})

export { createOverrideResolvers }
