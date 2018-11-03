import { Component } from 'react'
import { withRouter } from 'next/router'

class App extends Component {
  static async getInitialProps({ query }) {
    return query
  }

  constructor(props) {
    super(props)
    console.log(props)
  }

  render() {
    return <a href="/demo">demo</a>
  }
}

export default withRouter(App)
