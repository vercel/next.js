import { useMemo, useEffect } from 'react'
import { Store } from '../store'
import { Provider } from 'mobx-react'
import App, {Container} from 'next/app'
let store = new Store();

export default class MyApp extends App {

  state = {
    stores: {store}
  }

  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {};
    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }
    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props;
    const stores = this.state.stores;
    return <Provider {...stores} >
      <Component {...pageProps} />
    </Provider>
  }
}
