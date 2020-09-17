import React, { ReactNode } from 'react'
import Link from 'next/link'
import Head from 'next/head'

type Props = {
  children?: ReactNode
  title?: string
}

const Layout = ({ children, title = 'This is the default title' }: Props) => (
  <div>
    <Head>
      <title>{title}</title>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <header>
      <nav>
        <Link href="/">
          <a data-test="nav-home">Home</a>
        </Link>{' '}
        |{' '}
        <Link href="/about">
          <a data-test="nav-about">About</a>
        </Link>{' '}
        |{' '}
        <Link href="/users">
          <a data-test="nav-users-list">Users List</a>
        </Link>{' '}
        |{' '}
        <a data-test="nav-users-api" href="/api/users">
          Users API
        </a>
      </nav>
    </header>
    {children}
    <footer>
      <hr />
      <span>I'm here to stay (Footer)</span>
    </footer>
  </div>
)

export default Layout
