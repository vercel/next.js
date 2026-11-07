export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`:root { --x: 1 }`}</style>
      <Component {...pageProps} />
    </>
  )
}
