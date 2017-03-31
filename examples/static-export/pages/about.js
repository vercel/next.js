import { Component } from 'react'
import Router from 'next/router'

export default class About extends Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  static async getInitialProps ({ build }) {
    // this will get triggered on export!
    // useful for pulling in markdown files
    // during the build and doing other
    // custom logic
    if (build) return {}

    // Errors during the build will halt the build
    // Errors on the client-side will get routed to "An unexpected error has occurred."
    // throw new Error("can't build on client-side!")

    return {}
  }

  render () {
    return (
      <div>
        <h2>About Me</h2>
        <a onClick={() => Router.push('/')}>Go Back to Index</a>
      </div>
    )
  }
}
