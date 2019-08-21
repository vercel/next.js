import React from 'react'
import fetch from 'isomorphic-unfetch'
import { useRouter } from 'next/router'
import decodeJwt from 'jwt-decode'
import { getToken, removeToken } from './auth'

const initialContext = [undefined, () => {}]
const Token = React.createContext(initialContext)
const User = React.createContext(initialContext)
let isPageReady = false

export function getTokenPayload (token) {
  try {
    return decodeJwt(token)
  } catch (error) {
    // Ignore invalid tokens
  }
}

export function UserProvider ({ user, children }) {
  // Save the user and don't update it unless it's required, this is especially useful for pages
  // that require SSR and do a fetch of the user in `getInitialProps`
  const [state, setUser] = React.useState(user)

  return <User.Provider value={[state, setUser]}>{children}</User.Provider>
}

export function TokenProvider ({ children }) {
  const [token, setToken] = React.useState(
    // Don't try to set the token in the first page render to avoid a content mismatch
    isPageReady ? getToken() : undefined
  )

  React.useEffect(() => {
    isPageReady = true
    setToken(getToken())
  }, [])

  return <Token.Provider value={[token, setToken]}>{children}</Token.Provider>
}

export const useToken = () => React.useContext(Token)[0]

export const useUser = () => React.useContext(User)[0]

// Returns the payload of a client-side token
export const usePayload = () => {
  const token = useToken()
  const payload = React.useMemo(() => token && getTokenPayload(token), [token])

  return payload
}

// Returns true if there's a valid payload or a user set
export const useHasUser = () => {
  const payload = usePayload()
  const user = useUser()

  return Boolean(payload || user)
}

export const useLogout = () => {
  const setToken = React.useContext(Token)[1]
  const setUser = React.useContext(User)[1]
  const router = useRouter()

  return async () => {
    const res = await fetch('/api/logout')

    if (res.ok) {
      // Clear the state of user contexts, remove the token from cookies and do a redirect
      setToken()
      setUser()
      removeToken()
      router.push('/')
    }
  }
}
