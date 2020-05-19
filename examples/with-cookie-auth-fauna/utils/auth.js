import { useEffect } from 'react'
import Router from 'next/router'

export const login = ({ email }) => {
  Router.push('/profile')
}

export const logout = async () => {
  await fetch('/api/logout')

  window.localStorage.setItem('logout', Date.now())

  Router.push('/login')
}

export const withAuthSync = Component => {
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

    return <Component {...props} />
  }

  if (Component.getInitialProps) {
    Wrapper.getInitialProps = Component.getInitialProps
  }

  return Wrapper
}
