import {
  mergeSchemas,
  makeExecutableSchema,
  makeRemoteExecutableSchema,
} from 'apollo-server-micro'
import { setContext } from 'apollo-link-context'
import { createHttpLink } from 'apollo-link-http'
import cookie from 'cookie'

import { remoteTypeDefs } from './remoteSchema'
import { localTypeDefs, localResolvers } from './localSchema'
import { createOverrideResolvers } from './overrideSchema'
import { SECRET_COOKIE_NAME } from '../fauna/config'

const httpLink = new createHttpLink({
  uri: 'https://graphql.fauna.com/graphql',
  fetch,
})

// setContext links runs before any remote request by `delegateToSchema`
const contextlink = setContext((_, previousContext) => {
  let token = process.env.FAUNADB_PUBLIC_ACCESS_KEY // public token
  const { req } = previousContext.graphqlContext
  if (!req.headers.cookie)
    console.log('Setting context with default public token')
  if (req.headers.cookie) {
    const parsedCookie = cookie.parse(req.headers.cookie)
    const customCookie = parsedCookie[SECRET_COOKIE_NAME]
    if (customCookie) {
      console.log(
        'Found custom cookie. Re-setting context with this cookie value'
      )
      token = customCookie
    }
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
})

const link = contextlink.concat(httpLink)

// The following is extracted from: https://github.com/ptpaterson/netlify-faunadb-graphql-auth/blob/master/functions/graphql/overrideSchema.js
// *****************************************************************************
// Create the remote schema
// *****************************************************************************

/* Having trouble using introspectSchema.  See introspect branch.
 * https://github.com/ptpaterson/netlify-faunadb-graphql-auth/tree/introspect
 * using `netlify dev` to run the local server, the function setup code is run
 * on every request, and I have not confirmed whether or not this is a problem
 * on actual Netlify functions.
 */
// schema was downloaded from fauna and saved to local file.
const remoteExecutableSchema = makeRemoteExecutableSchema({
  schema: remoteTypeDefs,
  link,
})

// *****************************************************************************
// Create a schema for resolvers that are not in the remote schema
// *****************************************************************************

const localExecutableSchema = makeExecutableSchema({
  typeDefs: localTypeDefs,
  resolvers: localResolvers,
})

const schema = mergeSchemas({
  schemas: [remoteExecutableSchema, localExecutableSchema],
  resolvers: createOverrideResolvers(
    remoteExecutableSchema,
    localExecutableSchema
  ),
})

export default schema
