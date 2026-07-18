'use client'

import NavLink from 'next/nav-link'

export function Nav() {
  return (
    <nav>
      <NavLink href="/" activeClassName="active-home">
        Home
      </NavLink>
      <NavLink href="/blog" activeClassName="active-blog">
        Blog
      </NavLink>
      <NavLink
        href="/blog"
        exact
        className="blog-exact"
        activeClassName="active-blog-exact"
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
