import { createContext } from 'react'
import { useFetchUser } from '../lib/user'
export const AuthContext = createContext({ user: null, loading: false })

function AuthProvider({ children }) {
  const { user, loading } = useFetchUser()
  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider
