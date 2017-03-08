import React, { Component, PropTypes } from 'react'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const {html, head} = renderPage()
    const styles = flush()
    return { html, head, styles }
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
    const { html } = this.context._documentProps
    return <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
  }
}

export class NextScript extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getChunkScript (filename) {
    const { __NEXT_DATA__ } = this.context._documentProps
    let { buildStats } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : '-'

    return (
      <script type='text/javascript' src={`/_next/${hash}/${filename}`} />
    )
  }

  render () {
    const { staticMarkup, __NEXT_DATA__ } = this.context._documentProps

    return <div>
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `__NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}; module={};`
      }} />}
      { staticMarkup ? null : this.getChunkScript('commons.js') }
      { staticMarkup ? null : this.getChunkScript('main.js') }
    </div>
  }
}
