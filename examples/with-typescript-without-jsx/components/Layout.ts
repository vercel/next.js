import React, { ReactNode } from 'react'
import Link from 'next/link'
import Head from 'next/head'

const e = React.createElement

type Props = {
  children?: ReactNode
  title?: string
}

const Layout = ({ children, title = 'This is the default title' }: Props) =>
  e(
    'div',
    {},
    e(
      Head,
      {},
      e('title', title),
      e('meta', { charSet: 'utf-8' }),
      e('meta', {
        name: 'viewport',
        content: 'initial-scale=1.0, width=device-width',
      })
    ),
    e(
      'header',
      {},
      e(
        'nav',
        {},
        e(Link, { href: '/' }, e('a', {}, 'Home')),
        ' | ',
        e(Link, { href: '/about' }, e('a', {}, 'About')),
        ' | ',
        e(Link, { href: '/users' }, e('a', {}, 'Users List')),
        ' | ',
        e('a', { href: '/api/users' }, 'Users API')
      )
    ),
    children,
    e('footer', {}, e('hr'), e('span', {}, "I'm here to stay (Footer)"))
  )

export default Layout
