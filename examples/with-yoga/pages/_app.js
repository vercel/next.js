import { ThemeProvider, FontLoader } from '@gympass/yoga'

function MyApp({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <FontLoader />
      <Component {...pageProps} />
    </ThemeProvider>
  )
}

export default MyApp
