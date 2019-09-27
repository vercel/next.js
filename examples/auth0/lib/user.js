import React from 'react'
import fetch from 'isomorphic-unfetch'

const User = React.createContext({ user: null, loading: false })

export const fetchUser = async (cookie = '') => {
  const res = await fetch(
    '/api/me',
    cookie
      ? {
        headers: {
          cookie
        }
      }
      : {}
  )
  return res.ok ? res.json() : null
}

export const UserProvider = ({ value, children }) => {
  return <User.Provider value={value}>{children}</User.Provider>
}

export const useUser = () => React.useContext(User)

export const useFetchUser = () => {
  const [data, setUser] = React.useState({
    user: null,
    loading: true
  })

  React.useEffect(() => {
    if (data.user) {
      return
    }

    let isMounted = true

    fetchUser().then(user => {
      // Only set the user if the component is still mounted
      if (isMounted) {
        setUser({ user, loading: false })
      }
    })

    return () => {
      isMounted = false
    }
  }, [data])

  return data
}
