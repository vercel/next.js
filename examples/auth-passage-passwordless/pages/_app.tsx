import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { NextPage } from 'next';
import Layout from '../Components/layout';



type AppPropsWithLayout = AppProps & {
  Component: NextPage
}

export default function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )

}
