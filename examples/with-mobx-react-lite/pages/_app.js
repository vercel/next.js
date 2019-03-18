import App, { Container } from 'next/app'
import React from 'react'
import { InjectStoreContext, initializeData } from '../store'

class MyMobxApp extends App {
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}
    const initialStoreData = initializeData()

    // Provide the store to getInitialProps of pages
    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps({ ...ctx, initialStoreData })
    }

    return {
      pageProps,
      initialStoreData
    }
  }

  render () {
    const { Component, pageProps, initialStoreData } = this.props
    return (
      <Container>
        <InjectStoreContext initialData={initialStoreData}>
          <Component {...pageProps} />
        </InjectStoreContext>
      </Container>
    )
  }
}
export default MyMobxApp
