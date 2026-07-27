import React from 'react'

export default class extends React.Component {
  static getInitialProps({ asPath, req }) {
    return { asPath }
  }

  render() {
    return <div className="as-path-content">{this.props.asPath}</div>
  }
}
