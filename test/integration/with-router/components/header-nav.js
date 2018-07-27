import * as React from 'react'
import { withRouter } from 'next/router'
import Link from 'next/link'

const pages = {
  '/a': 'Foo',
  '/b': 'Bar'
}

class HeaderNav extends React.Component {
  constructor ({ router }) {
    super()

    this.state = {
      activeURL: router.asPath
    }

    this.handleRouteChange = this.handleRouteChange.bind(this)
  }

  componentDidMount () {
    this.props.router.events.on('routeChangeComplete', this.handleRouteChange)
  }

  componentWillUnmount () {
    this.props.router.events.off('routeChangeComplete', this.handleRouteChange)
  }

  handleRouteChange (url) {
    this.setState({
      activeURL: url
    })
  }

  render () {
    return (
      <nav>
        {
          Object.keys(pages).map(url => (
            <Link href={url} key={url} prefetch>
              <a className={this.state.activeURL === url ? 'active' : ''}>
                { pages[url] }
              </a>
            </Link>
          ))
        }
      </nav>
    )
  }
}

export default withRouter(HeaderNav)
