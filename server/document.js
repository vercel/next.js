import React, { Component } from 'react'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml } = renderPage()
    return { html, head, errorHtml }
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
    let { publicPath } = this.context._documentProps.__NEXT_DATA__

    return (
      <link
        key={filename}
        rel='preload'
        href={`${publicPath}${filename}`}
        as='script'
      />
    )
  }

  getPreloadMainLinks () {
    const { dev } = this.context._documentProps
    if (dev) {
      return []
    }

    // In the production mode, we have a single asset with all the JS content.
    return [
      this.getChunkPreloadLink('app.js')
    ]
  }

  render () {
    const { head, styles, __NEXT_DATA__ } = this.context._documentProps
    const { pathname, publicPath } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)

    return <head {...this.props}>
      <link rel='preload' href={`${publicPath}pages${pagePathname}.js`} as='script' />
      {this.getPreloadMainLinks()}
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
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
    nonce: PropTypes.string
  }

  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getChunkScript (filename, additionalProps = {}) {
    let { publicPath } = this.context._documentProps.__NEXT_DATA__

    return (
      <script
        key={filename}
        type='text/javascript'
        src={`${publicPath}${filename}`}
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
    const { __NEXT_DATA__ } = this.context._documentProps
    const { pathname, publicPath } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)

    return <div>
      <script nonce={this.props.nonce} dangerouslySetInnerHTML={{
        __html: `
__NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}
module={}
__NEXT_LOADED_PAGES__ = []
__NEXT_REGISTER_PAGE = function (route, fn) { __NEXT_LOADED_PAGES__.push({ route: route, fn: fn }) }
        `
      }} />
      <script async id={`__NEXT_PAGE__${pathname}`} type='text/javascript' src={`${publicPath}pages${pagePathname}.js`} />
      {this.getScripts()}
    </div>
  }
}

function getPagePathname (pathname) {
  if (pathname === '/') return '/index'
  return pathname.replace(/(\/index)?\.js$/, '')
}
