import { createGlobalStyle, ThemeProvider } from 'styled-components'
import type { AppProps } from 'next/app'

const GlobalStyle = createGlobalStyle`
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
          Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
    box-sizing: border-box;
  }

  * {
    box-sizing: border-box;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
`

// https://www.canva.com/colors/color-palettes/spread-your-wings/
const theme = {
  colors: {
    primary: '#0070f3',
    darker: '#0000FF',
    lighter: '#31B4F2',
    secondary: '#F8CF40',
  },
}

const App: React.FC<AppProps> = ({ Component, pageProps }: AppProps) => (
  <>
    <GlobalStyle />
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  </>
)

export default App
