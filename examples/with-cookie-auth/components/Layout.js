import React from 'react'
import Link from 'next/link'
import { processLogout } from '../lib/auth'

const Layout = ({ auth, children }) => {
  const { user = {} } = auth || {}
  return (
    <div>
      <span>Welcome, {user.name || 'Guest'}!</span>
      <ul style={{ listStyle: 'none', float: 'right' }}>
        <li><Link href='/'><a>Home</a></Link></li>
        {user.email ?
          (
            <React.Fragment>
              <li onClick={processLogout} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Logout</li>
              <li><Link href='/profile'><a>Profile</a></Link></li>
            </React.Fragment>
          ) :
          (
            <li><Link href='/login'><a>Login</a></Link></li>
          )}
      </ul>
      {children}
    </div>
  )
}

export default Layout
