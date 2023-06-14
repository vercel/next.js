import type { AppProps } from 'next/app'
import { ThemeProvider } from '@gympass/yoga'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
