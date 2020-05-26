import App from 'next/app'
import { Provider } from 'react-redux'

import withRematch from '../shared/withRematch'

class MyApp extends App {
  render() {
    const { Component, pageProps, reduxStore } = this.props
    return (
      <Provider store={reduxStore}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}

export default withRematch(MyApp)
