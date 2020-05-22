import { Helmet } from 'react-helmet'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Helmet
        htmlAttributes={{ lang: 'en' }}
        title="Hello next.js!"
        meta={[
          {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1',
          },
          { property: 'og:title', content: 'Hello next.js!' },
        ]}
      />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
