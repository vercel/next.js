import React, { Component, PropTypes } from 'react'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, styles }
  }

  static childContextTypes = {
    _documentProps: PropTypes.any
  }

  getChildContext () {
    return { _documentProps: this.props }
  }

  render () {
    return <html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </html>
  }
}

export class Head extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { head, styles } = this.context._documentProps
    return <head>
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
      {styles || null}
      {this.props.children}
    </head>
  }
}

export class Main extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { html, errorHtml } = this.context._documentProps
    return (
      <div>
        <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
        <div id='__next-error' dangerouslySetInnerHTML={{ __html: errorHtml }} />
      </div>
    )
  }
}

export class NextScript extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getChunkScript (filename, additionalProps = {}) {
    const { __NEXT_DATA__ } = this.context._documentProps
    let { buildStats } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : '-'

    return (
      <script
        type='text/javascript'
        src={`/_next/${hash}/${filename}`}
        {...additionalProps}
      />
    )
  }

  getScripts () {
    const { dev } = this.context._documentProps
    if (dev) {
      return (
        <div>
          { this.getChunkScript('manifest.js') }
          { this.getChunkScript('commons.js') }
          { this.getChunkScript('main.js') }
        </div>
      )
    }

    // In the production mode, we have a single asset with all the JS content.
    // So, we can load the script with async
    return this.getChunkScript('app.js', { async: true })
  }

  render () {
    const { staticMarkup, __NEXT_DATA__ } = this.context._documentProps

    return <div>
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `__NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}; module={};`
      }} />}
      {staticMarkup ? null : this.getScripts()}
    </div>
  }
}
