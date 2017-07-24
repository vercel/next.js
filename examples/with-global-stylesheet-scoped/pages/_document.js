import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { ServerStyleSheet } from 'styled-components'
import { collectStyles } from '../hocs/withStyles'

export default class MyDocument extends Document {
  render () {
    const sheet = new ServerStyleSheet()
    const main = sheet.collectStyles(<Main />)
    const styleTags = sheet.getStyleElement()
    const classNames = collectStyles()
    return (
      <html style={{ background: '#EEE', color: '#444' }}>
        <Head>
          <meta
            name='viewport'
            content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,minimal-ui'
          />
          <meta name='theme-color' content='#673ab7' />
          <link rel='manifest' href='static/manifest.json' />
          <title>App</title>
          {styleTags}
        </Head>
        <body className={classNames.join(' ')}>
          {main}
          <NextScript />
          <script defer src='https://code.getmdl.io/1.3.0/material.min.js' />
        </body>
      </html>
    )
  }
}
