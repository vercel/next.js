import React from 'react'
import ErrorComponent from 'next/error'
import redirect from 'next-universal-redirect'

class Error extends React.Component {
  static getInitialProps ({ req, res, xhr, pathname }) {
    const statusCode = res ? res.statusCode : (xhr ? xhr.status : null)
    return { statusCode }
  }

  render () {
    return <ErrorComponent statusCode={this.props.statusCode} />
  }
}

const list = new Map()
list.set('/example', '/example-redirected')

export default redirect(list)(Error)
