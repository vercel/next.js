import React, { Component } from 'react'
import PropTypes from 'prop-types'
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
    let { assetPrefix, buildId } = __NEXT_DATA__
    return chunks.map((chunk) => (
      <link
        key={chunk}
        rel='preload'
        href={`${assetPrefix}/_next/${buildId}/webpack/chunks/${chunk}`}
        as='script'
      />
    ))
  }

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const { pathname, buildId, assetPrefix, nextExport } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    return <head {...this.props}>
      <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} as='script' />
      <link rel='preload' href={`${assetPrefix}/_next/${buildId}/page/_error/index.js`} as='script' />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {(head || []).map((h, i) => React.cloneElement(h, { key: h.key || i }))}
      {styles || null}
      {this.props.children}
    </head>
  }
}

export class Main extends Component {
  static propTypes = {
    className: PropTypes.string
  }

  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { html, errorHtml } = this.context._documentProps
    const { className } = this.props
    return (
      <div className={className}>
        <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
        <div id='__next-error' dangerouslySetInnerHTML={{ __html: errorHtml }} />
      </div>
    )
  }
}

export class NextScript extends Component {
  static propTypes = {
    nonce: PropTypes.string,
    postpone: PropTypes.bool
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
    let { assetPrefix, buildId } = __NEXT_DATA__
    return chunks.map((chunk) => (
      <script
        async
        key={chunk}
        type='text/javascript'
        src={`${assetPrefix}/_next/${buildId}/webpack/chunks/${chunk}`}
      />
    ))
  }

  render () {
    const { nonce, postpone } = this.props
    const { staticMarkup, __NEXT_DATA__, chunks } = this.context._documentProps
    const { pathname, nextExport, buildId, assetPrefix } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname, nextExport)

    __NEXT_DATA__.chunks = chunks

    const scripts = [
      <script async id={`__NEXT_PAGE__${pathname}`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page${pagePathname}`} />,
      <script async id={`__NEXT_PAGE__/_error`} type='text/javascript' src={`${assetPrefix}/_next/${buildId}/page/_error/index.js`} />
    ]

    if (staticMarkup) {
      return <div>{scripts}</div>
    }

    scripts.push(
      ...this.getDynamicChunks(),
      ...this.getScripts()
    )

    return <script nonce={nonce} dangerouslySetInnerHTML={{
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

        __NEXT_START = function () {
          delete window.__NEXT_START
          var scripts = document.getElementsByTagName('script')
          var el = scripts[scripts.length - 1]
          ;${htmlescape(scripts.map(script => [
            script.props.src,
            script.props.id,
            script.props.async
          ]))}.map(function (x) {
            var s = document.createElement('script')
            s.src = x[0]
            if (x[1]) s.id = x[1]
            s.async = x[2]
            el.parentNode.insertBefore(s, el)
          })
        }

        ${postpone ? '' : '__NEXT_START()'}
      `
    }} />
  }
}

function getPagePathname (pathname, nextExport) {
  if (!nextExport) return pathname
  if (pathname === '/') return '/index.js'
  return `${pathname}/index.js`
}
