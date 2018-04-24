import React from 'react'
import Link from 'next/link'
import { processLogout } from '../lib/auth'

const Layout = ({ auth, children }) => {
  const { user = {} } = auth || {}
  return (
    <div>
      <span>Welcome, {user.name || 'Guest'}!</span>
      <ul>
        <li><Link href='/'><a>Home</a></Link></li>
        {user.email
          ? (
            <React.Fragment>
              <li><a onClick={processLogout}>Logout</a></li>
              <li><Link href='/profile'><a>Profile</a></Link></li>
            </React.Fragment>
          )
          : (
            <li><Link href='/login'><a>Login</a></Link></li>
          )}
      </ul>
      {children}
      <style jsx>{`
        ul {
          list-style: none;
          float: right;
        }
        ul li {
          display: inline;
          margin: 0.25em;
        }
        ul li a {
          text-decoration: underline;
          cursor: pointer;
          font-size: 1em;
          color: #333;
          border: none;
        }
      `}</style>
    </div>
  )
}

export default Layout
