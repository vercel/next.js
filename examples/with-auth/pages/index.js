import React from 'react'
import Link from 'next/prefetch'

export default class Home extends React.Component {
  static async getInitialProps ({ req }) {
    const user = req ? req.user : null
    return { user }
  }

  componentDidMount () {
    if (this.props.user) {
      try {
        window.localStorage.setItem('user', this.props.user)
      } catch (err) {}
    } else if (typeof this.props.user !== 'undefined') {
      window.localStorage.removeItem('user')
    }
  }

  render () {
    return (
      <div>
        <h1>Welcome to Zombocom</h1>
        <h2>This is a public homepage</h2>
        <ul>
          <li><Link href='/login'>Login</Link></li>
          <li><Link href='/private'>Go to a private page 🙀</Link></li>
        </ul>
        <style jsx>{`
          div {
            text-align: center;
          }

          ul {
            list-style: none;
          }
        `}</style>
      </div>
    )
  }
}
