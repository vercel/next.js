import { getTokens } from '@kiwicom/orbit-components'
import { ThemeProvider, createGlobalStyle } from 'styled-components'

const GlobalStyle = createGlobalStyle`
  body {
    width: 100vw;
    height: 100vh;
    margin: 0 auto;
    background-color: ${({ theme }) => theme.orbit.paletteCloudLight};
  }
`

const tokens = getTokens()

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={{ orbit: tokens }}>
      <>
        <GlobalStyle />
        <Component {...pageProps} />
      </>
    </ThemeProvider>
  )
}
