import React from 'react'
import App, { Container } from 'next/app'

export default class MyApp extends App {
  // find this

  static async getInitialProps ({ ctx }) {
    const { query, pathname, asPath } = ctx
    return { url: { query, pathname, asPath } }
  }

  render () {
    const { Component, url } = this.props
    return (
      <Container>
        <Component url={url} />
      </Container>
    )
  }
}
