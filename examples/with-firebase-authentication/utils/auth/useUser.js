import { useEffect, useState } from 'react'
import Router from 'next/router'
import cookies from 'js-cookie'

const useUser = () => {
  const [user, setUser] = useState()
  useEffect(() => {
    const cookie = cookies.get('auth')
    if (!cookie) {
      Router.push('/')
      return
    }
    setUser(JSON.parse(cookie))
  }, [])

  return { user }
}

export { useUser }
