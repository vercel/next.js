import { registerCustomResolver } from 'next/image'

registerCustomResolver(({ src, width, quality }) => {
  return `https://customresolver.com/${src}?w~~${width},q~~${quality}`
})

const App = ({ Component, pageProps }) => {
  return <Component {...pageProps} />
}

export default App
