import Head from 'next/head'
import Header from './header'

function Layout({ children }) {
  return (
    <>
      <Head>
        <title>Next.js with Auth0</title>
      </Head>
      <Header />
      <main>
        <div className="container">{children}</div>
      </main>
      <style jsx global>
        {`
          body {
            margin: 0;
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
              Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
              sans-serif;
          }
          .container {
            max-width: 42rem;
            margin: 1.5rem auto;
          }
        `}
      </style>
    </>
  )
}

export default Layout
