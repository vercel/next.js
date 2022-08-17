import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/root.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Next.js with-xata</title>
        <meta property="og:title" content="Next.js with-xata" key="title" />
        <meta
          property="og:description"
          content="Run Next.js with Xata with this awesome template"
          key="description"
        />
        <meta
          name="theme-color"
          content="#000"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#fff"
          media="(prefers-color-scheme: light)"
        />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
