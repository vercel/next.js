import nextCookie from 'next-cookies'
import { NextPageContext } from 'next'
import Router from 'next/router'

export const auth = (ctx: NextPageContext) => {
  const { token } = nextCookie(ctx)
  // If there's no token, it means the user is not logged in.
  if (!token) {
    if (typeof window != undefined) {
      if (ctx.res) {
        ctx.res.writeHead(302, { Location: '/account/login' })
      }
    } else {
      Router.push('/account/login')
    }
  }
}
