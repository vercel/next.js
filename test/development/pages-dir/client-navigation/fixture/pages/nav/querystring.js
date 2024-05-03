import React from 'react'
import Link from 'next/link'

export default class AsyncProps extends React.Component {
  static async getInitialProps({ query: { id = 0 } }) {
    return { id }
  }

  render() {
    return (
      <div className="nav-querystring">
        <Link
          href={`/nav/querystring?id=${parseInt(this.props.id) + 1}`}
          id="next-id-link"
        >
          Click here
        </Link>
        <Link href="/nav/querystring" id="main-page">
          Click here
        </Link>
        <p className={`nav-id-${this.props.id}`}>{this.props.id}</p>
      </div>
    )
  }
}
