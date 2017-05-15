import React, { Component } from 'react'
import PropTypes from 'prop-types'
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

  getChunkPreloadLink (filename) {
    const { __NEXT_DATA__ } = this.context._documentProps
    let { buildStats, assetPrefix } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : '-'

    return (
      <link
        key={filename}
        rel='preload'
        href={`${assetPrefix}/_next/${hash}/${filename}`}
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

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const { pathname, buildId, assetPrefix, nextExport } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    return <head>
      <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} as='script' />
      <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page/_error/index.js`} as='script' />
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
    let { buildStats, assetPrefix } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : '-'

    return (
      <script
        key={filename}
        type='text/javascript'
        src={`${assetPrefix}/_next/${hash}/${filename}`}
        {...additionalProps}
      />
    )
  }

  getScripts () {
    const { dev } = this.context._documentProps
    if (dev) {
      return [
        this.getChunkScript('manifest.js'),
        this.getChunkScript('commons.js'),
        this.getChunkScript('main.js')
      ]
    }

    // In the production mode, we have a single asset with all the JS content.
    // So, we can load the script with async
    return [this.getChunkScript('app.js', { async: true })]
  }

  render () {
    const { staticMarkup, __NEXT_DATA__ } = this.context._documentProps
    const { pathname, nextExport, buildId, assetPrefix } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    return <div>
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `
          __NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}
          module={}
          __NEXT_LOADED_PAGES__ = []

          __NEXT_REGISTER_PAGE = function (route, fn) {
            __NEXT_LOADED_PAGES__.push({ route: route, fn: fn })
          }
        `
      }} />}

      <script async id={`__NEXT_PAGE__${pathname}`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} />
      <script async id={`__NEXT_PAGE__/_error`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page/_error/index.js`} />
      {staticMarkup ? null : this.getScripts()}
    </div>
  }
}

function getPagePathname (pathname, nextExport) {
  if (!nextExport) return pathname
  if (pathname === '/') return '/index.js'
  return `${pathname}/index.js`
}
