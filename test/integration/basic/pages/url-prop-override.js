import React from 'react'
export default class extends React.Component {
  static getInitialProps () {
    return {
      url: 'test' // This gets overridden by Next in lib/_app.js
    }
  }
  render () {
    const { url } = this.props
    return (
      <div>
        <p id='pathname'>{url.pathname}</p>
        <p id='query'>{Object.keys(url.query).length}</p>
        <p id='aspath'>{url.asPath}</p>
      </div>
    )
  }
}
