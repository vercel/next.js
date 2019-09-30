import { useState, useEffect } from 'react'
import fetch from 'isomorphic-unfetch'

export const fetchUser = async (cookie = '') => {
  const res = await fetch(
    'http://localhost:3000/api/me',
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

export const useFetchUser = () => {
  const [data, setUser] = useState({
    user: null,
    loading: true
  })

  useEffect(() => {
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
