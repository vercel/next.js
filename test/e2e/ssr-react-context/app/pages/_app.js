import { Idk } from '../context'

export default function MyApp({ Component, pageProps }) {
  return (
    <Idk.Provider value="hello world">
      <Component {...pageProps} />
    </Idk.Provider>
  )
}
