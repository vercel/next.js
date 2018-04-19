import React from 'react'
import FaPencil from 'react-icons/lib/fa/pencil'

import Link from './link'

export default () => (
  <nav className='navbar'>
    <div className='container'>
      <div className='navbar-brand'>
        <Link href='/'>
          <a className='navbar-item'>
            <img src={require('../static/logo.png')} alt='Logo' />
          </a>
        </Link>
        <span className='navbar-burger burger' data-target='navbarMenuHero'>
          <span />
          <span />
          <span />
        </span>
      </div>
      <div id='navbarMenuHero' className='navbar-menu'>
        <div className='navbar-end'>
          <Link href='/'>
            <a className='navbar-item'>Home</a>
          </Link>
          <Link href='/examples/'>
            <a className='navbar-item'>Examples</a>
          </Link>
          <Link href='/docs/'>
            <a className='navbar-item'>Documentation</a>
          </Link>
          <span className='navbar-item'>
            <Link href='/editor/'>
              <a className='button is-info is-inverted'>
                <span className='icon'>
                  <FaPencil />
                </span>
                <span>Editor</span>
              </a>
            </Link>
          </span>
        </div>
      </div>
    </div>
  </nav>
)
