import React, { Component } from 'react'
import Link from 'next/link'

class Header extends Component {
  render() {
    return (
      <div>
        <nav>
          <ul>
            <li>
              <Link href="/" passHref>
                <a>Home</a>
              </Link>
            </li>
            <li>
              <Link href="/github-users" passHref>
                <a>Async Example </a>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    )
  }
}

export default Header
