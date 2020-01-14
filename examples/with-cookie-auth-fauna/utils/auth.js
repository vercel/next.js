import { useEffect } from 'react'
import Router from 'next/router'
import cookie from 'cookie'
import { FAUNA_SECRET_COOKIE } from './fauna-auth'

export const login = ({ email }) => {
  window.localStorage.setItem('loggedInUser', email)
  Router.push('/profile')
}

export const auth = ctx => {
  if (ctx.req) {
    var cookies = cookie.parse(ctx.req.headers.cookie ?? '')
    var faunaSecret = cookies[FAUNA_SECRET_COOKIE]
    if (!faunaSecret) {
      // If `ctx.req` is available it means we are on the server.
      ctx.res.writeHead(302, { Location: '/login' })
      ctx.res.end()
    }
    return faunaSecret
  } else {
    if (!window.localStorage.getItem('loggedInUser')) {
      Router.push('/login')
    }
    // The user is logged in, the page will perform it's own
    // authed API call.
    return null
  }
}

export const logout = async () => {
  await fetch('/api/logout')

  window.localStorage.setItem('logout', Date.now())
  window.localStorage.removeItem('loggedInUser')

  Router.push('/login')
}

export const withAuthSync = WrappedComponent => {
  const Wrapper = props => {
    const syncLogout = event => {
      if (event.key === 'logout') {
        console.log('logged out from storage!')
        Router.push('/login')
      }
    }

    useEffect(() => {
      window.addEventListener('storage', syncLogout)

      return () => {
        window.removeEventListener('storage', syncLogout)
        window.localStorage.removeItem('logout')
      }
    }, [])

    return <WrappedComponent {...props} />
  }

  Wrapper.getInitialProps = async ctx => {
    const token = auth(ctx)

    const componentProps =
      WrappedComponent.getInitialProps &&
      (await WrappedComponent.getInitialProps(ctx))

    return { ...componentProps, token }
  }

  return Wrapper
}
