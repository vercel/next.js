import type { AppProps } from 'next/app'
import 'video.js/dist/video-js.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
