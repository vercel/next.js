import React, { Component } from 'react'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'
import _getAssetPath from '../lib/get-asset-path'

function Fragment ({ children }) {
  return children
}

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
  }

  static childContextTypes = {
    _documentProps: PropTypes.any,
    getAssetPath: PropTypes.func
  }

  // allow it to be overwritten by custom _document
  _getAssetPath (hash, asset, assetPrefix, assetMap) {
    return _getAssetPath(hash, asset, assetPrefix, assetMap)
  }

  getChildContext () {
    return { _documentProps: this.props, getAssetPath: this._getAssetPath.bind(this) }
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
    _documentProps: PropTypes.any,
    getAssetPath: PropTypes.func
  }

  getChunkPreloadLink (filename) {
    const { __NEXT_DATA__ } = this.context._documentProps
    const getAssetPath = this.context.getAssetPath
    let { buildStats, assetPrefix, assetMap, buildId } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : buildId

    return (
      <link
        key={filename}
        rel='preload'
        href={getAssetPath(hash, `/${filename}`, assetPrefix, assetMap)}
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
    const getAssetPath = this.context.getAssetPath
    let { assetPrefix, assetMap, buildId } = __NEXT_DATA__
    return chunks.map((chunk) => (
      <link
        key={chunk}
        rel='preload'
        href={getAssetPath(buildId, `/webpack/chunks/${chunk}`, assetPrefix, assetMap)}
        as='script'
      />
    ))
  }

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const getAssetPath = this.context.getAssetPath
    const { pathname, buildId, assetPrefix, assetMap, nextExport } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    return <head {...this.props}>
      <link rel='preload' href={getAssetPath(buildId, `/page${pagePathname}`, assetPrefix, assetMap)} as='script' />
      <link rel='preload' href={getAssetPath(buildId, `/page/_error/index.js`, assetPrefix, assetMap)} as='script' />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {(head || []).map((h, i) => React.cloneElement(h, { key: h.key || i }))}
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
    _documentProps: PropTypes.any,
    getAssetPath: PropTypes.func
  }

  getChunkScript (filename, additionalProps = {}) {
    const { __NEXT_DATA__ } = this.context._documentProps
    const getAssetPath = this.context.getAssetPath
    let { buildStats, assetPrefix, assetMap, buildId } = __NEXT_DATA__
    const hash = buildStats ? buildStats[filename].hash : buildId

    return (
      <script
        key={filename}
        type='text/javascript'
        src={getAssetPath(hash, `/${filename}`, assetPrefix, assetMap)}
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
    const getAssetPath = this.context.getAssetPath
    let { assetPrefix, assetMap, buildId } = __NEXT_DATA__
    return (
      <Fragment>
        {chunks.map((chunk) => (
          <script
            async
            key={chunk}
            type='text/javascript'
            src={getAssetPath(buildId, `/webpack/chunks/${chunk}`, assetPrefix, assetMap)}
          />
        ))}
      </Fragment>
    )
  }

  render () {
    const { staticMarkup, __NEXT_DATA__, chunks } = this.context._documentProps
    const getAssetPath = this.context.getAssetPath
    const { pathname, nextExport, buildId, assetPrefix, assetMap } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    __NEXT_DATA__.chunks = chunks

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
        `
      }} />}
      <script async id={`__NEXT_PAGE__${pathname}`} type='text/javascript' src={getAssetPath(buildId, `/page${pagePathname}`, assetPrefix, assetMap)} />
      <script async id={`__NEXT_PAGE__/_error`} type='text/javascript' src={getAssetPath(buildId, `/page/_error/index.js`, assetPrefix, assetMap)} />
      {staticMarkup ? null : this.getDynamicChunks()}
      {staticMarkup ? null : this.getScripts()}
    </Fragment>
  }
}

function getPagePathname (pathname, nextExport) {
  if (!nextExport) return pathname
  if (pathname === '/') return '/index.js'
  return `${pathname}/index.js`
}
