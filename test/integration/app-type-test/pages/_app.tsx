import type AppProps from 'next/app'
import React from 'react'

type CustomProps = { foo: string }

function MyApp({ Component, pageProps, foo }: AppProps & CustomProps) {
  return (
    <div>
      <Component {...pageProps} />
      <p>Custom prop: {foo}</p>
    </div>
  )
}

MyApp.getInitialProps = async () => ({ foo: 'bar' })

export default MyApp
