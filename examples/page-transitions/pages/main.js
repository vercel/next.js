import { PureComponent } from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import { Link } from '../routes'

// -----------------------------------------------

export default class Main extends PureComponent {
  render () {
    return (<div>
      <Head>
        <title>{this.props.pathname} - Page Transitions</title>
      </Head>

      <header>
        <Link to='/'>
          <a className={this.props.pathname === '/' ? 'active' : ''}>Homepage</a>
        </Link>

        <Link route='main' params={{ slug: 'about' }}>
          <a className={this.props.pathname === 'about' ? 'active' : ''}>About</a>
        </Link>

        <Link route='main' params={{ slug: 'contact' }}>
          <a className={this.props.pathname === 'contact' ? 'active' : ''}>Contact</a>
        </Link>
      </header>

      <div id='container' className={`page-${this.props.pathname}`}>
        <h1 dangerouslySetInnerHTML={{ __html: this.props.pathname }} />
      </div>
    </div>)
  }
}

Main.propTypes = {
  pathname: PropTypes.string.isRequired
}
