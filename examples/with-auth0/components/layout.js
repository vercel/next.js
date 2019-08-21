import Head from 'next/head'
import Header from './header'
import { TokenProvider } from '../lib/user'

const Layout = ({ user, children }) => (
  <>
    <Head>
      <title>With Cookies</title>
    </Head>

    <TokenProvider>
      <Header user={user} />

      <main>
        <div className='container'>{children}</div>
      </main>
    </TokenProvider>

    <style jsx>{`
      .container {
        max-width: 42rem;
        margin: 1.5rem auto;
      }
    `}</style>
    <style jsx global>{`
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        color: #333;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          'Helvetica Neue', Arial, Noto Sans, sans-serif, 'Apple Color Emoji',
          'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
      }
    `}</style>
  </>
)

export default Layout
