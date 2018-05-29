import React from 'react'
import PropTypes from 'prop-types'
import App, {Container} from 'next/app'
import {provide, types} from 'ioc'
import {Link} from '../routes'

export default class MyApp extends App {
  static async getInitialProps(appState) {
    const { Component, ctx } = appState;

console.log('\n\n ------- App + getInitialProps ------', ctx.pathname, '+++ \n\n');

    const pageProps = Component.getInitialProps ? await Component.getInitialProps(ctx) : {};

    return {
      pageProps
    };
  }

  render () {
    const {Component, pageProps} = this.props
    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}
