import App from 'next/app'
import React from 'react'
import { InjectStoreContext, initializeData } from '../store'

class MyMobxApp extends App {
  render() {
    const { Component, pageProps, initialStoreData } = this.props
    return (
      <InjectStoreContext initialData={initialStoreData}>
        <Component {...pageProps} />
      </InjectStoreContext>
    )
  }
}

export async function getStaticProps({ Component, ctx }) {
  let pageProps = {}
  const initialStoreData = initializeData()

  // Provide the store to getStaticProps of pages
  if (Component.getStaticProps) {
    pageProps = await Component.getStaticProps({ ...ctx, initialStoreData })
  }

  return {
    props: {
      pageProps,
      initialStoreData,
    },
  }
}

export default MyMobxApp
