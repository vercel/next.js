import { NextComponentType, NextPageContext } from 'next'
import App from 'next/app'
import { Router } from 'next/dist/client/router'
import React from 'react'
import GNB from 'src/components/GNB'

type AppProps = {
  Component: NextComponentType<NextPageContext>
  router: Router
  pageProps: any
  err: any
}

export class CustomApp extends App<AppProps> {
  constructor(props: AppProps) {
    super(props)
  }

  render() {
    const { Component, pageProps } = this.props

    return (
      <>
        <div className="wrapper">
          <style jsx={true}>{`
            .wrapper {
              display: flex;
              flex-direction: column;
            }
          `}</style>
          <GNB />
          <Component {...pageProps} />
        </div>
      </>
    )
  }
}

export default CustomApp
