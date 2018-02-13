import React, { Component } from 'react'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'

const Fragment = React.Fragment || function Fragment ({ children }) {
  return <div>{children}</div>
}

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
    let { buildStats, assetPrefix, buildId } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : buildId

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

  getPreloadDynamicChunks () {
    const { chunks, __NEXT_DATA__ } = this.context._documentProps
    let { assetPrefix } = __NEXT_DATA__
    return chunks.filenames.map((chunk) => (
      <link
        key={chunk}
        rel='preload'
        href={`${assetPrefix}/_next/webpack/chunks/${chunk}`}
        as='script'
      />
    ))
  }

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const { page, pathname, buildId, assetPrefix } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)

    return <head {...this.props}>
      {(head || []).map((h, i) => React.cloneElement(h, { key: h.key || i }))}
      {page !== '/_error' && <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} as='script' />}
      <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page/_error.js`} as='script' />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
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
      <Fragment>
        <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
        <div id='__next-error' dangerouslySetInnerHTML={{ __html: errorHtml }} />
      </Fragment>
    )
  }
}

export class NextScript extends Component {
  static propTypes = {
    nonce: PropTypes.string
  }

  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getChunkScript (filename, additionalProps = {}) {
    const { __NEXT_DATA__ } = this.context._documentProps
    let { buildStats, assetPrefix, buildId } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : buildId

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

  getDynamicChunks () {
    const { chunks, __NEXT_DATA__ } = this.context._documentProps
    let { assetPrefix } = __NEXT_DATA__
    return (
      <Fragment>
        {chunks.filenames.map((chunk) => (
          <script
            async
            key={chunk}
            type='text/javascript'
            src={`${assetPrefix}/_next/webpack/chunks/${chunk}`}
          />
        ))}
      </Fragment>
    )
  }

  render () {
    const { staticMarkup, __NEXT_DATA__, chunks } = this.context._documentProps
    const { page, pathname, buildId, assetPrefix } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)

    __NEXT_DATA__.chunks = chunks.names

    return <Fragment>
      {staticMarkup ? null : <script nonce={this.props.nonce} dangerouslySetInnerHTML={{
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

          ${page === '_error' && `
          __NEXT_REGISTER_PAGE(${htmlescape(pathname)}, function() {
            var error = new Error('Page does not exist: ${htmlescape(pathname)}')
            error.statusCode = 404

            return { error: error }
          })
          `}
        `
      }} />}
      {page !== '/_error' && <script async id={`__NEXT_PAGE__${pathname}`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} />}
      <script async id={`__NEXT_PAGE__/_error`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page/_error.js`} />
      {staticMarkup ? null : this.getDynamicChunks()}
      {staticMarkup ? null : this.getScripts()}
    </Fragment>
  }
}

function getPagePathname (pathname) {
  if (pathname === '/') {
    return '/index.js'
  }

  return `${pathname}.js`
}
