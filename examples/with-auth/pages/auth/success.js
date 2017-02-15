import Link from 'next/prefetch'
import React from 'react'
import Session from '../../components/session'

export default class extends React.Component {
  async componentDidMount () {
    const session = new Session()
    await session.getSession(true)
    this.props.url.push('/')
  }

  render () {
    return (
      <div>
        <div style={{textAlign: 'center'}}>
          <p>You are now signed in.</p>
          <p><Link href='/'><a>Continue</a></Link></p>
        </div>
      </div>
    )
  }
}
