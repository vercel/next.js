import { Grommet, grommet as grommetTheme } from 'grommet'

export default function App({ Component, pageProps }) {
  return (
    <Grommet theme={grommetTheme}>
      <Component {...pageProps} />
    </Grommet>
  )
}
