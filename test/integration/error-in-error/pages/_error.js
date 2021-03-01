import React from 'react'

class Error extends React.Component {
  static async getInitialProps({ req, res, err }) {
    if (!req.url.startsWith('/404') && !req.url.startsWith('/500')) {
      await Promise.reject(new Error('an error in error'))
    }
    const statusCode = res ? res.statusCode : err ? err.statusCode : null
    return { statusCode }
  }

  render() {
    return (
      <p>
        {this.props.statusCode
          ? `An error ${this.props.statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
    )
  }
}

export default Error
