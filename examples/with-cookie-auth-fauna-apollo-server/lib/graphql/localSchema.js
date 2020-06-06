import { gql } from 'apollo-server-micro'
import cookie from 'cookie'
import faunadb from 'faunadb'
import {
  SECRET_COOKIE_NAME,
  faunaClient,
  unsetCookieConfig,
} from '../fauna/config'

const q = faunadb.query

const localTypeDefs = gql`
  type Query {
    validCookie: String!
  }
`

const localResolvers = {
  Query: {
    validCookie: async (root, args, context) => {
      console.log('LOCAL query validCookie')
      let isCookieTokenVerified
      const { cookie: setCookie } = context.res
      // short circuit if cookie exists
      if (context.req.headers.cookie) {
        const parsedCookies = cookie.parse(context.req.headers.cookie)
        const customCookie = parsedCookies[SECRET_COOKIE_NAME]

        if (customCookie) {
          console.log('Proceeding to validate cookie token')
          try {
            isCookieTokenVerified = await faunaClient(customCookie).query(
              q.Call(q.Function('validate_token'), customCookie)
            )
          } catch (err) {
            console.log(
              'Validation failed for cookie token, deleting cookie --',
              err.message
            )
            setCookie(SECRET_COOKIE_NAME, '', unsetCookieConfig)
          }

          if (isCookieTokenVerified) {
            console.log('Cookie token is valid, cookie stays')
            return customCookie
          }
          if (!isCookieTokenVerified) {
            console.log('Cookie is invalid, cookie already deleted')
            return ''
          }
          console.log('Unexpected error')
          return ''
        }
        console.log('No custom cookie found on headers')
        return ''
      }
      console.log('Unexpected. No cookies on headers -- Unsetting cookie')
      setCookie(SECRET_COOKIE_NAME, '', unsetCookieConfig)
      return ''
    },
  },
}

export { localTypeDefs, localResolvers }
