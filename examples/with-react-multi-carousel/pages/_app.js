/*
This is copy paste from the with-material-ui example.
*/

import React from 'react'
import App, { Container } from 'next/app'
import Head from 'next/head'
import { MuiThemeProvider } from '@material-ui/core/styles'
import CssBaseline from '@material-ui/core/CssBaseline'
import JssProvider from 'react-jss/lib/JssProvider'

import getPageContext from '../src/getPageContext'

class MyApp extends App {
  constructor () {
    super()
    this.pageContext = getPageContext()
  }

  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Head>
          <title>react-multi-carousel</title>
        </Head>
        <JssProvider
          registry={this.pageContext.sheetsRegistry}
          generateClassName={this.pageContext.generateClassName}
        >
          <MuiThemeProvider
            theme={this.pageContext.theme}
            sheetsManager={this.pageContext.sheetsManager}
          >
            <CssBaseline />
            <Component pageContext={this.pageContext} {...pageProps} />
          </MuiThemeProvider>
        </JssProvider>
      </Container>
    )
  }
}

export default MyApp
