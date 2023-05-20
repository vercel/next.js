import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/root.css'

const metas = {
  title: 'Next.js with-xata',
  description: 'Run Next.js with Xata with this awesome template',
  image:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/og.jpg'
      : 'https://nextjs-with-xata.vercel.app/og.jpg',
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>{metas.title}</title>
        <meta property="og:title" content={metas.title} key="og:title" />
        <meta property="og:image" content={metas.image} key="og:image" />
        <meta
          property="description"
          content={metas.description}
          key="description"
        />
        <meta
          property="og:description"
          content={metas.description}
          key="og:description"
        />
        <meta property="og:type" content="website" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          property="twitter:title"
          content={metas.title}
          key="twitter:title"
        />
        <meta
          property="twitter:description"
          content={metas.description}
          key="twitter:description"
        />
        <meta
          property="twitter:image"
          content={metas.image}
          key="twitter:image"
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
