import { Component } from 'react'
import Link from 'next/link'

let count = 0

export default class SelfReload extends Component {
  static getInitialProps ({ res }) {
    if (res) return { count: 0 }
    count += 1

    return { count }
  }

  render () {
    return (
      <div id='self-reload-page'>
        <Link href='/nav/self-reload'>
          <a id='self-reload-link'>Self Reload</a>
        </Link>
        <p>COUNT: {this.props.count}</p>
      </div>
    )
  }
}
