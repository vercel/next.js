import { ComponentType, FC } from 'react'
import { Provider } from 'react-redux'
import { AppInitialProps } from 'next/app'
import { store } from '../app/store'
import '../styles/globals.css'

type AppProps = {
  Component: ComponentType<AppInitialProps>
  pageProps: AppInitialProps
}

const MyApp: FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  )
}

export default MyApp
