import React from 'react'
import { magic } from '../../magic'
import cookie from "cookie";

const Index = ({ email }) => {
  return <div>hello {email}</div>
}

export const getAuthCookie = (req) => {
  if (req && req.headers && req.headers.cookie) {
    const { coolcookie } = cookie.parse(req.headers.cookie)
    return coolcookie
  }
  return null
}

Index.getInitialProps = async (ctx) => {
  if (typeof window === 'undefined') {
    const { req, res } = ctx
    const coolcookie = getAuthCookie(req)
    if (!coolcookie) {
      res.writeHead(302, {
        Location: '/welcome',
      })
      res.end()
      return
    }
    const { email } = await magic.users.getMetadataByIssuer(coolcookie)
    return { email }
  }
  return { email: null }
}

export default Index
