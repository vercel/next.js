import PlausibleProvider from 'next-plausible'

export default function MyApp({ Component, pageProps }) {
  return (
    <PlausibleProvider domain={process.env.NEXT_PUBLIC_DOMAIN}>
      <Component {...pageProps} />
    </PlausibleProvider>
  )
}
