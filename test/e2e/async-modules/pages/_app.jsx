const appValue = await Promise.resolve('hello')

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} appValue={appValue} />
}
