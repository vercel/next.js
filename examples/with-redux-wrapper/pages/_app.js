import React from 'react'
import withRedux from 'next-redux-wrapper'
import {initStore} from '../store'

export default withRedux(initStore)(class MyApp extends React.Component {
  static async getInitialProps ({Component, ctx}) {
    return {
      pageProps: (Component.getInitialProps ? await Component.getInitialProps(ctx) : {})
    }
  }

  render () {
    const {Component, pageProps} = this.props
    return <Component {...pageProps} />
  }
})
