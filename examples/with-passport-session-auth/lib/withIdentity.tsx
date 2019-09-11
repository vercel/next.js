import React, { useContext } from 'react'
import nextCookie from 'next-cookies'
import redirect from './redirect'
import NextApp, { AppInitialProps, AppContext } from 'next/app'
import { NextPageContext } from 'next'

export interface UserIdentity {
  id: number
  name: string
  email: string
}
type IdentityProviderProps = Readonly<AppInitialProps> & {
  session: UserIdentity
}
const IdentityContext = React.createContext<UserIdentity>(
  (null as unknown) as UserIdentity
)

const loginPage = '/auth/login'

export const redirectToLogin = (ctx: NextPageContext) => {
  if (
    (ctx && ctx.pathname === loginPage) ||
    (typeof window !== 'undefined' && window.location.pathname === loginPage)
  ) {
    return
  }

  redirect(ctx, loginPage)
}

// any is needed to use as JSX element
const withIdentity = (App: NextApp | any) => {
  return class IdentityProvider extends React.Component<IdentityProviderProps> {
    static displayName = `IdentityProvider(MyApp)`
    static async getInitialProps(
      ctx: AppContext
    ): Promise<IdentityProviderProps> {
      // Get inner app's props
      let appProps: AppInitialProps
      if (NextApp.getInitialProps) {
        appProps = await NextApp.getInitialProps(ctx)
      } else {
        appProps = { pageProps: {} }
      }

      const { passportSession } = nextCookie(ctx.ctx)

      // Redirect to login if page is protected but no session exists
      if (!passportSession) {
        redirectToLogin(ctx.ctx)
        return Promise.resolve({
          pageProps: null,
          session: (null as unknown) as UserIdentity,
        })
      }

      const serializedCookie = Buffer.from(passportSession, 'base64').toString()

      const {
        passport: { user },
      }: {
        passport: { user: UserIdentity }
      } = JSON.parse(serializedCookie)

      // redirect to login if cookie exists but is empty
      if (!user) {
        redirectToLogin(ctx.ctx)
      }

      const session: UserIdentity = user

      return {
        ...appProps,
        session,
      }
    }

    render() {
      const { session, ...appProps } = this.props

      return (
        <IdentityContext.Provider value={session}>
          <App {...appProps} />
        </IdentityContext.Provider>
      )
    }
  }
}

export default withIdentity

export const useIdentity = (): UserIdentity => useContext(IdentityContext)
