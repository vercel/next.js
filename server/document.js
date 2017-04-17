import React, { Component, PropTypes } from 'react'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
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

  getChunkPreloadLink (filename) {
    const { __NEXT_DATA__ } = this.context._documentProps
    let { buildStats } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : '-'

    return (
      <link
        key={filename}
        rel='preload'
        href={`/_next/${hash}/${filename}`}
        as='script'
      />
    )
  }

  getPreloadMainLinks () {
    const { dev } = this.context._documentProps
    if (dev) {
      return [
        this.getChunkPreloadLink('manifest.js'),
        this.getChunkPreloadLink('commons.js'),
        this.getChunkPreloadLink('main.js')
      ]
    }

    // In the production mode, we have a single asset with all the JS content.
    return [
      this.getChunkPreloadLink('app.js')
    ]
  }

  getPreloadDynamicChunks () {
    const { chunks } = this.context._documentProps
    return chunks.map((chunk) => (
      <link
        key={chunk}
        rel='preload'
        href={`/_webpack/chunks/${chunk}`}
        as='script'
      />
    ))
  }

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const { pathname, buildId } = __NEXT_DATA__

    return <head>
      <link rel='preload' href={`/_next/${buildId}/page${pathname}`} as='script' />
      <link rel='preload' href={`/_next/${buildId}/page/_error`} as='script' />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
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

  getDynamicChunks () {
    const { chunks } = this.context._documentProps
    return (
      <div>
        {chunks.map((chunk) => (
          <script
            async
            key={chunk}
            type='text/javascript'
            src={`/_webpack/chunks/${chunk}`}
          />
        ))}
      </div>
    )
  }

  render () {
    const { staticMarkup, __NEXT_DATA__, chunks } = this.context._documentProps
    const { pathname, buildId } = __NEXT_DATA__

    __NEXT_DATA__.chunks = chunks

    return <div>
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `
          __NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}
          module={}
          __NEXT_LOADED_PAGES__ = []
          __NEXT_LOADED_CHUNKS__ = []

          __NEXT_REGISTER_PAGE = function (route, fn) {
            __NEXT_LOADED_PAGES__.push({ route: route, fn: fn })
          }

          __NEXT_REGISTER_CHUNK = function (chunkName, fn) {
            __NEXT_LOADED_CHUNKS__.push({ chunkName: chunkName, fn: fn })
          }
        `
      }} />}
      <script async type='text/javascript' src={`/_next/${buildId}/page${pathname}`} />
      <script async type='text/javascript' src={`/_next/${buildId}/page/_error`} />
      {staticMarkup ? null : this.getDynamicChunks()}
      {staticMarkup ? null : this.getScripts()}
    </div>
  }
}
