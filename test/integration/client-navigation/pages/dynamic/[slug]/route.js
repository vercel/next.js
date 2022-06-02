import React from 'react'

export default class DynamicRoute extends React.Component {
  static async getInitialProps({ query = { slug: 'default' } }) {
    return {
      query,
    }
  }

  render() {
    return <p id="dynamic-page">{this.props.query.slug}</p>
  }
}
