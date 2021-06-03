import { Component } from 'react'
import Link from 'next/link'
import Router, { withRouter } from 'next/router'

let getInitialPropsRunCount = 1

const linkStyle = {
  marginRight: 10,
}

export default withRouter(
  class extends Component {
    static getInitialProps({ res }) {
      if (res) return { getInitialPropsRunCount: 1 }
      getInitialPropsRunCount++

      return { getInitialPropsRunCount }
    }

    getCurrentCounter() {
      const { router } = this.props
      return router.query.counter ? parseInt(router.query.counter) : 0
    }

    increase() {
      const counter = this.getCurrentCounter()
      const href = `/nav/shallow-routing?counter=${counter + 1}`
      Router.push(href, href, { shallow: true })
    }

    increaseNonShallow() {
      const counter = this.getCurrentCounter()
      const href = `/nav/shallow-routing?counter=${counter + 1}`
      Router.push(href, href, {})
    }

    gotoNavShallow() {
      const href = `/nav`
      Router.push(href, href, { shallow: true })
    }

    render() {
      return (
        <div className="shallow-routing">
          <Link href="/nav">
            <a id="home-link" style={linkStyle}>
              Home
            </a>
          </Link>
          <div id="counter" style={{ marginBottom: 4000 }}>
            Counter: {this.getCurrentCounter()}
          </div>
          <div id="get-initial-props-run-count">
            getInitialProps run count: {this.props.getInitialPropsRunCount}
          </div>
          <button id="increase" onClick={() => this.increase()}>
            Increase
          </button>
          <button id="increase2" onClick={() => this.increaseNonShallow()}>
            Increase Non-Shallow
          </button>
          <button id="invalidShallow" onClick={() => this.gotoNavShallow()}>
            Invalid Shallow Nav
          </button>
        </div>
      )
    }
  }
)
