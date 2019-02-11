import React from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'

const propTypes = {
  pathname: PropTypes.String
}

const Header = ({ pathname }) => (
  <header>
    <Link href='/'>
      <a className={pathname === '/' ? 'is-active' : ''}>Home</a>
    </Link>
    <span> - </span>
    <Link href='/about'>
      <a className={pathname === '/about' ? 'is-active' : ''}>About</a>
    </Link>
  </header>
)

Header.propTypes = propTypes

export default Header
