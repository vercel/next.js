/* global location */
import React from 'react'
import Link from 'next/link'

export default class DynamicPage extends React.Component {
  state = {}

  static getInitialProps ({ query }) {
    return { text: query.text }
  }

  componentDidMount () {
    const [, hash] = location.href.split('#')
    this.setState({ hash })
  }

  render () {
    const { text } = this.props
    const { hash } = this.state

    return (
      <div id='dynamic-page'>
        <div>
          <Link href='/'>
            <a>Go Back</a>
          </Link>
        </div>
        <p>{ text }</p>
        <div id='hash'>Hash: {hash}</div>
      </div>
    )
  }
}
