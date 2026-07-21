'use client'

import NavLink from 'next/nav-link'

export function Nav() {
  return (
    <nav>
      <NavLink
        href="/"
        className={({ isActive }) => (isActive ? 'active-home' : '')}
      >
        Home
      </NavLink>
      <NavLink
        href="/blog"
        className={({ isActive }) => (isActive ? 'active-blog' : '')}
      >
        Blog
      </NavLink>
      <NavLink
        href="/blog"
        exact
        className={({ isActive }) =>
          isActive ? 'blog-exact active-blog-exact' : 'blog-exact'
        }
      >
        Blog exact
      </NavLink>
      <NavLink
        href="/about"
        className={({ isActive }) => (isActive ? 'fn-active' : 'fn-idle')}
      >
        About
      </NavLink>
      <NavLink href="/contact">
        {({ isActive }) => (isActive ? 'Contact-on' : 'Contact-off')}
      </NavLink>
    </nav>
  )
}
