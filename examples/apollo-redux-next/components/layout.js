import React, { Component, PropTypes } from 'react'
import Link from 'next/link'
import Head from 'next/head'

class Layout extends Component {
  static propTypes = {
    title: PropTypes.string
  };
  render () {
    const { title, children } = this.props
    return (
      <div>
        <Head>
          <title>{ title }</title>
          <meta charSet='utf-8' />
          <meta name='viewport' content='initial-scale=1.0, width=device-width' />
          {/* Materialize css */}
          <link href='https://fonts.googleapis.com/icon?family=Material+Icons' rel='stylesheet' />
          <link href='https://fonts.googleapis.com/css?family=Roboto|Roboto+Condensed' rel='stylesheet' />
          <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/materialize/0.97.8/css/materialize.min.css' />
        </Head>
        <header>
          <nav>
            <Link href='/'> Home </Link> |
            <Link href='/about'> About </Link>
          </nav>
        </header>

        { children }

        <footer>
          This is the footer
        </footer>
      </div>
    )
  }
}

export default Layout
