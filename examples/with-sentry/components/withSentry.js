import React from 'react'
import Raven from 'raven-js'

function withSentry (Child) {
  return class WrappedComponent extends React.Component {
    static getInitialProps (context) {
      return Child.getInitialProps(context)
    }
    constructor (props) {
      super(props)
      this.state = {
        error: null
      }
      Raven.config(
        // change this for your Sentry DSN
        'https://cb0826e4617043e1bdafcb519df0992b@sentry.io/237733'
      ).install()
    }

    componentDidCatch (error, errorInfo) {
      this.setState({ error })
      Raven.captureException(error, { extra: errorInfo })
    }

    render () {
      return <Child {...this.props} />
    }
  }
}

export default withSentry
