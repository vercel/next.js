export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <p>custom _app</p>
      <Component {...pageProps} />
    </>
  )
}
