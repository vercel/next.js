import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { renderStatic } from 'glamor/server'
import { collectStyles } from '../hocs/withStyles'

export default class MyDocument extends Document {
  static async getInitialProps({ renderPage }) {
    const page = renderPage()
    const styles = renderStatic(() => page.html)
    return { ...page, ...styles }
  }

  constructor(props) {
    super(props)
    const { __NEXT_DATA__, ids } = props
    if (ids) {
      __NEXT_DATA__.ids = this.props.ids
    }
  }

  render() {
    const classNames = collectStyles()
    return (
      <html style={{ background: '#EEE', color: '#444' }}>
        <Head>
          <meta
            name="viewport"
            content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,minimal-ui"
          />
          <meta name="theme-color" content="#673ab7" />
          <link rel="manifest" href="static/manifest.json" />
          <title>App</title>
          <style dangerouslySetInnerHTML={{ __html: this.props.css }} />
        </Head>
        <body className={classNames.join(' ')}>
          <Main />
          <NextScript />
          <script defer src="https://code.getmdl.io/1.3.0/material.min.js" />
        </body>
      </html>
    )
  }
}
