import { createContext, useContext } from 'react'
import createAuthUser from 'utils/auth/createAuthUser'

// Defaults to empty AuthUser object.
export const AuthUserContext = createContext(createAuthUser())

const useAuthUser = () => {
  return useContext(AuthUserContext)
}

export default useAuthUser
