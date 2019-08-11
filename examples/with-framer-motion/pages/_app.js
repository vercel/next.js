import React from 'react'
import App, { Container } from 'next/app'
import { AnimatePresence } from 'framer-motion';

export default class MyApp extends App {
  render () {
    const { Component, pageProps, router } = this.props
    return (
      <>
        <Container>
          <AnimatePresence exitBeforeEnter>
            <Component {...pageProps} key={router.route}/>
          </AnimatePresence>
        </Container>
        <style>{`
          body {
            padding: 0;
            margin: 0;
            background: #f9fbf8;
          }

          * {
            box-sizing: border-box;
            font-family: Helvetica, sans-serif;
            font-weight: 900;
            color: #222;
          }
        `}</style>
      </>
    )
  }
}
