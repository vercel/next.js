import { useEffect } from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'

export const login = ({ token }) => {
  cookie.set('token', token, { expires: 1 })
  Router.push('/profile')
}

export const auth = ctx => {
  const { token } = nextCookie(ctx)

  /*
   * If `ctx.req` is available it means we are on the server.
   * Additionally if there's no token it means the user is not logged in.
   */
  if (ctx.req && !token) {
    ctx.res.writeHead(302, { Location: '/login' })
    ctx.res.end()
  }

  // We already checked for server. This should only happen on client.
  if (!token) {
    Router.push('/login')
  }

  return token
}

export const logout = () => {
  cookie.remove('token')
  // to support logging out from all windows
  window.localStorage.setItem('logout', Date.now())
  Router.push('/login')
}

export const useAuthSync = () =>{
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
}
