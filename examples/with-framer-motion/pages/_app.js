import React from 'react'
import App, { Container } from 'next/app'
import { AnimatePresence } from 'framer-motion'

export default class MyApp extends App {
  /**
   * Handle scrolling gracefully, since next/router scrolls to top
   * before exit animation is complete.
   *
   * Note that next/link components should also be using `scroll={false}`
   **/
  handleExitComplete () {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 })
    }
  }

  render () {
    const { Component, pageProps, router } = this.props
    return (
      <>
        <Container>
          <AnimatePresence
            exitBeforeEnter
            onExitComplete={this.handleExitComplete}
          >
            <Component {...pageProps} key={router.route} />
          </AnimatePresence>
        </Container>
        <style>
          {`
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
        `}
        </style>
      </>
    )
  }
}
