import { AppProps } from 'next/app'

import { ThemeProvider } from '../components/ThemeProvider'

import GlobalStyle from '../styles/global'

function MyApp({ Component, pageProps }: AppProps): JSX.Element {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
      <GlobalStyle />
    </ThemeProvider>
  )
}

export default MyApp
