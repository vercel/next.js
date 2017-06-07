import React from 'react'
import withPage from '../hocs/withPage'
import Clock from '../components/Clock'
import GlobalCounter from '../components/GlobalCounter'
import Link from 'next/link'

class OtherPage extends React.Component {
  static getInitialProps ({ store, req }) {
    store.dispatch({ type: 'TICK', light: !req, ts: Date.now() })
  }

  render () {
    return (
      <div>
        <h1>Other Page</h1>
        <Clock />
        <GlobalCounter />
        <br />
        <nav>
          <Link href='/'><a>Navigate</a></Link>
        </nav>
      </div>
    )
  }
}

export default withPage(OtherPage)
