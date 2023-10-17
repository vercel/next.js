import { Component } from 'react'

class Page extends Component {
  static getInitialProps({ query }) {
    return { query }
  }
  render() {
    return JSON.stringify(this.props.query, null, 2)
  }
}

export default Page
