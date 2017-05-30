import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default class Layout extends React.Component {
  render () {
    return (
      <div>
        <Head>
          <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/materialize/0.97.8/css/materialize.min.css' />
        </Head>
        <nav className='light-blue darken-3' role='navigation'>
          <div className='nav-wrapper container'>
            <Link href='/'>
              <a id='logo-container' className='brand-logo yellow-text'>Feathers Next</a>
            </Link>
            <ul className='right'>
              <li>
                <Link href='/view' as='/posted-pictures'>
                  <a>Posts</a>
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        <div className='container'>
          {this.props.children}
        </div>
      </div>
    )
  }
}
