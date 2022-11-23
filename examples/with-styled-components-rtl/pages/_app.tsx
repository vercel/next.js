import type { AppProps } from 'next/app'
import type { DefaultTheme } from 'styled-components'
import { ThemeProvider } from 'styled-components'

const theme: DefaultTheme = {
  colors: {
    primary: '#0070f3',
  },
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
