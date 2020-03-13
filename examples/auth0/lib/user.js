import { useState, useEffect } from 'react'
import fetch from 'isomorphic-unfetch'

export async function fetchUser(cookie = '') {
  const response = await fetch('/api/me', cookie ? { headers: { cookie } } : {})
  if (!response.ok) {
    return null
  }
  const userData = await response.json()
  return userData
}

export function useFetchUser({ required = false } = {}) {
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(
    () => {
      if (!loading && user) {
        return
      }
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return { user, loading }
}
