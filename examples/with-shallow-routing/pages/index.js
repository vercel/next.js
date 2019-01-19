import React from 'react'
import Link from 'next/link'
import Router, { withRouter } from 'next/router'
import { format } from 'url'

let counter = 1

class Index extends React.Component {
  static getInitialProps ({ res }) {
    if (res) {
      return { initialPropsCounter: 1 }
    }

    counter++
    return {
      initialPropsCounter: counter
    }
  }

  reload () {
    const { pathname, query } = Router
    Router.push(format({ pathname, query }))
  }

  incrementStateCounter () {
    const { router } = this.props
    const currentCounter = router.query.counter
      ? parseInt(router.query.counter)
      : 0
    const href = `/?counter=${currentCounter + 1}`
    Router.push(href, href, { shallow: true })
  }

  render () {
    const { initialPropsCounter, router } = this.props

    return (
      <div>
        <h2>This is the Home Page</h2>
        <Link href='/about'>
          <a>About</a>
        </Link>
        <button onClick={() => this.reload()}>Reload</button>
        <button onClick={() => this.incrementStateCounter()}>
          Change State Counter
        </button>
        <p>"getInitialProps" ran for "{initialPropsCounter}" times.</p>
        <p>
          Counter: "{router.query.counter || 0}
          ".
        </p>
      </div>
    )
  }
}

export default withRouter(Index)
