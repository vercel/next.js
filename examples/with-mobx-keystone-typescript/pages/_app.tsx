import { AppContext } from 'next/app'
import { getSnapshot } from 'mobx-keystone'
import { StoreProvider, initStore } from '../store'

export default function App({ Component, pageProps, initialState }: any) {
  return (
    <StoreProvider snapshot={initialState}>
      <Component {...pageProps} />
    </StoreProvider>
  )
}

App.getInitialProps = async ({ Component, ctx }: AppContext) => {
  //
  // Use getInitialProps as a step in the lifecycle when
  // we can initialize our store
  //
  const store = initStore()

  //
  // Check whether the page being rendered by the App has a
  // static getInitialProps method and if so call it
  //
  let pageProps = {}
  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx)
  }

  return { initialState: getSnapshot(store), pageProps }
}
