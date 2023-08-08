import type { AppProps } from 'next/app'
import { Provider } from 'react-redux'
import { wrapper } from '../store/store'

const WrappedApp = ({ Component, ...rest }: AppProps) => {
  const { store, props } = wrapper.useWrappedStore(rest)

  return (
    <Provider store={store}>
      <Component {...props.pageProps} />
    </Provider>
  )
}

export default WrappedApp
