import { Component } from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'
import fetch from 'isomorphic-unfetch'

export const login = async ({ username, url }) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })
    if (response.ok) {
      const { token } = await response.json()
      cookie.set('token', token, { expires: 1 })
      Router.push('/profile')
    } else {
      console.log('Login failed.')
      // https://github.com/developit/unfetch#caveats
      let error = new Error(response.statusText)
      error.response = response
      return Promise.reject(error)
    }
  } catch (error) {
    console.error(
      'You have an error in your code or there are Network issues.',
      error
    )
    throw new Error(error)
  }
}

export const logout = () => {
  cookie.remove('token')
  // to support logging out from all windows
  window.localStorage.setItem('logout', Date.now())
  Router.push('/login')
}

export function withAuthSync (WrappedComponent) {
  return class extends Component {
    constructor (props) {
      super(props)

      this.syncLogout = this.syncLogout.bind(this)
    }
    componentDidMount () {
      window.addEventListener('storage', this.syncLogout)
    }

    componentWillUnmount () {
      window.removeEventListener('storage', this.syncLogout)
      window.localStorage.removeItem('logout')
    }

    syncLogout (event) {
      if (event.key === 'logout') {
        console.log('logged out from storage!')
        Router.push('/login')
      }
    }

    render () {
      return <WrappedComponent {...this.props} />
    }
  }
}

export default ctx => {
  const { token } = nextCookie(ctx)

  if (ctx.req && !token) {
    ctx.res.writeHead(302, { Location: '/login' })
    ctx.res.end()
    return
  }

  if (!token) {
    Router.push('/login')
  }

  return token
}
