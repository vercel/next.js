import { UserProvider } from '@auth0/nextjs-auth0'

export default function App({ Component, pageProps }) {
  // optionally pass the 'user' prop from pages that require server-side
  // rendering to prepopulate the 'useUser' hook.

  const { user } = pageProps

  return (
    <UserProvider user={user}>
      <Component {...pageProps} />
    </UserProvider>
  )
}
