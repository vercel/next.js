import React from 'react'
import { authenticate, logout, logoutEvent } from '../utils'

export default class Private extends React.Component {
  static async getInitialProps ({ req, res }) {
    const user = await authenticate(req, res)
    return { user }
  }

  componentDidMount () {
    this.onLogout = eve => logoutEvent(eve, this.props.url)
    window.addEventListener('storage', this.onLogout, false)
  }

  componentWillUnmount () {
    window.removeEventListener('storage', this.onLogout, false)
  }

  render () {
    return (
      <div>
        <p>This is private <strong>{this.props.user}</strong></p>
        <a href='#' onClick={logout}>logout</a>
        <style jsx>{`
          div {
            text-align: center;
          }
        `}</style>
      </div>
    )
  }
}
