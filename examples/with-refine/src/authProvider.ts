import { AuthBindings } from '@refinedev/core'
import nookies from 'nookies'

const mockUsers = [
  {
    email: 'admin@refine.dev',
    roles: ['admin'],
  },
  {
    email: 'editor@refine.dev',
    roles: ['editor'],
  },
]

export const authProvider: AuthBindings = {
  login: async ({ email }) => {
    // Suppose we actually send a request to the back end here.
    const user = mockUsers.find((item) => item.email === email)

    if (user) {
      nookies.set(null, 'auth', JSON.stringify(user), {
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      })
      return {
        success: true,
        redirectTo: '/',
      }
    }

    return {
      success: false,
    }
  },
  logout: async () => {
    nookies.destroy(null, 'auth')
    return {
      success: true,
      redirectTo: '/login',
    }
  },
  onError: async (error) => {
    if (error && error.statusCode === 401) {
      return {
        error: new Error('Unauthorized'),
        logout: true,
        redirectTo: '/login',
      }
    }

    return {}
  },
  check: async (ctx) => {
    const cookies = nookies.get(ctx)
    return cookies['auth']
      ? {
          authenticated: true,
        }
      : {
          authenticated: false,
          error: {
            message: 'Check failed',
            name: 'Unauthorized',
          },
          logout: true,
          redirectTo: '/login',
        }
  },
  getPermissions: () => {
    const auth = nookies.get()['auth']
    if (auth) {
      const parsedUser = JSON.parse(auth)
      return parsedUser.roles
    }
    return null
  },
  getIdentity: () => {
    const auth = nookies.get()['auth']
    if (auth) {
      const parsedUser = JSON.parse(auth)
      return parsedUser.username
    }
    return null
  },
}
