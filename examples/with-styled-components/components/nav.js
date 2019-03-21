import React from 'react'
import Link from 'next/link'
import styled from 'styled-components'

const StyledNav = styled.nav`
  text-align: center;
  ul {
    display: flex;
    justify-content: space-between;
    padding: 4px 16px;
    li {
      display: flex;
      padding: 6px 8px;
    }
  }
  a {
    color: #067df7;
    text-decoration: none;
    font-size: 13px;
  }
`

const links = [
  { href: 'https://github.com/segmentio/create-next-app', label: 'Github' }
].map(link => {
  link.key = `nav-link-${link.href}-${link.label}`
  return link
})

const Nav = () => (
  <StyledNav>
    <ul>
      <li>
        <Link prefetch href="/">
          <a>Home</a>
        </Link>
      </li>
      <ul>
        {links.map(({ key, href, label }) => (
          <li key={key}>
            <Link href={href}>
              <a>{label}</a>
            </Link>
          </li>
        ))}
      </ul>
    </ul>
  </StyledNav>
)

export default Nav
