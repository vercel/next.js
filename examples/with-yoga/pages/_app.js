import { ThemeProvider, FontLoader } from '@gympass/yoga'
import { createGlobalStyle } from 'styled-components'

const GlobalStyle = createGlobalStyle`
  body {
    margin: 20px;
    padding: 0;
    box-sizing: border-box;
  }
`

function MyApp({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <GlobalStyle />
      <FontLoader />
      <Component {...pageProps} />
    </ThemeProvider>
  )
}

export default MyApp
