import { useState, useEffect } from 'react'
import fetch from 'isomorphic-unfetch'

export async function fetchUser (cookie = '') {
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

export function useFetchUser ({ required } = {}) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  useEffect(() => {
    setLoading(true)
    let isMounted = true

    fetchUser().then(user => {
      // Only set the user if the component is still mounted
      if (isMounted) {
        // When the user is not logged in but login is required
        if (required && !user) {
          window.location.href = '/api/login'
          return
        }
        setUser(user)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  return { user, loading }
}
