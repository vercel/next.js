import { Component } from 'react'
import Link from 'next/link'

let count = 0

export default class OnClick extends Component {
  static getInitialProps ({ res }) {
    if (res) return { count: 0 }
    count += 1

    return { count }
  }

  render () {
    return (
      <div id='on-click-page'>
        <Link href='/nav/on-click'>
          <a id='on-click-link' onClick={() => ++count}>Self Reload</a>
        </Link>
        <Link href='/nav/on-click'>
          <a id='on-click-link-prevent-default' onClick={(e) => { e.preventDefault(); ++count }}>Self Reload</a>
        </Link>
        <p>COUNT: {this.props.count}</p>
      </div>
    )
  }
}
