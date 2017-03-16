import { Component } from 'react'
import Link from 'next/link'
import Router from 'next/router'

let getInitialPropsRunCount = 1

const linkStyle = {
  marginRight: 10
}

export default class extends Component {
  static getInitialProps ({ res }) {
    if (res) return { getInitialPropsRunCount: 1 }
    getInitialPropsRunCount++

    return { getInitialPropsRunCount }
  }

  increase () {
    const counter = this.getCurrentCounter()
    const href = `/nav/shallow-routing?counter=${counter + 1}`
    Router.push(href, href, { shallow: true })
  }

  getCurrentCounter () {
    const { url } = this.props
    return url.query.counter ? parseInt(url.query.counter) : 0
  }

  render () {
    return (
      <div className='shallow-routing'>
        <Link href='/nav'><a id='home-link' style={linkStyle}>Home</a></Link>
        <div id='counter'>
          Counter: {this.getCurrentCounter()}
        </div>
        <div id='get-initial-props-run-count'>
          getInitialProps run count: {this.props.getInitialPropsRunCount}
        </div>
        <button id='increase' onClick={() => this.increase()}>Increase</button>
      </div>
    )
  }
}
