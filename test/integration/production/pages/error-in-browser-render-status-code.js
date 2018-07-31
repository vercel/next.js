import React from 'react'
export default class ErrorInRenderPage extends React.Component {
  render () {
    if (typeof window !== 'undefined') {
      const error = new Error('An Expected error occured')
      // This will be extracted by getInitialProps in the _error page,
      // which will result in a different error message being rendered.
      error.statusCode = 404
      throw error
    }
    return <div />
  }
}
