/* eslint-disable */
import React, { Component } from 'react'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'
import css from 'styled-jsx/css'

const Fragment = React.Fragment || function Fragment ({ children }) {
  return <div>{children}</div>
}

export default class Document extends Component {
  static childContextTypes = {
    _documentProps: PropTypes.any
  }

  static getInitialProps ({ renderPage, styleNonce }) {
    const { html, head, buildManifest } = renderPage()
    const styles = flush({ nonce: styleNonce })
    return { html, head, styles, buildManifest }
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

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string
  }

  getCssLinks () {
    const { assetPrefix, files, __NEXT_DATA__: { crossOrigin } } = this.context._documentProps
    if(!files || files.length === 0) {
      return null
    }

    return files.map((file) => {
      // Only render .css files here
      if(!/\.css$/.exec(file)) {
        return null
      }

      return <link
        key={file}
        rel='stylesheet'
        href={`${assetPrefix}/_next/${file}`}
        crossOrigin={this.props.crossOrigin || crossOrigin}
      />
    })
  }

  getPreloadDynamicChunks () {
    const { dynamicImports, assetPrefix, scriptNonce, __NEXT_DATA__: { crossOrigin } } = this.context._documentProps
    return dynamicImports.map((bundle) => {
      return <link
        rel='preload'
        key={bundle.file}
        href={`${assetPrefix}/_next/${bundle.file}`}
        as='script'
        nonce={this.props.nonce || scriptNonce}
        crossOrigin={this.props.crossOrigin || crossOrigin}
      />
    })
  }

  getPreloadMainLinks () {
    const { assetPrefix, files, scriptNonce, __NEXT_DATA__: { crossOrigin } } = this.context._documentProps
    if(!files || files.length === 0) {
      return null
    }

    return files.map((file) => {
      // Only render .js files here
      if(!/\.js$/.exec(file)) {
        return null
      }

      return <link
        key={file}
        nonce={this.props.nonce || scriptNonce }
        rel='preload'
        href={`${assetPrefix}/_next/${file}`}
        as='script'
        crossOrigin={this.props.crossOrigin || crossOrigin}
      />
    })
  }

  render () {
    const { head, styles, csp, styleNonce, scriptNonce, staticMarkup, assetPrefix, __NEXT_DATA__ } = this.context._documentProps
    const { page, buildId, crossOrigin } = __NEXT_DATA__
    const pagePathname = getPagePathname(page)

    let children = this.props.children
    // show a warning if Head contains <title> (only in development)
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, (child) => {
        if (child && child.type === 'title') {
          console.warn("Warning: <title> should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-title")
        }
        return child
      })
    }

    return <head {...this.props}>
      { (staticMarkup && csp) ? <meta http-equiv="Content-Security-Policy" content={csp} /> : null }
      { styleNonce ? <meta property="csp-nonce" content={styleNonce} /> : null }
      {head}
      {page !== '/_error' && <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} as='script' nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />}
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} as='script' nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} as='script' nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {this.getCssLinks()}
      {styles || null}
      { process.env.NODE_ENV !== 'production' && <style nonce={styleNonce}>{`
        .__next_error__ {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
          z-index: 2147483647;
        }
      `}</style> }
      {children}
    </head>
  }
}

export class Main extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { html } = this.context._documentProps
    return (
      <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
    )
  }
}

export class NextScript extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string
  }

  getDynamicChunks () {
    const { dynamicImports, assetPrefix, scriptNonce, __NEXT_DATA__: { crossOrigin } } = this.context._documentProps
    return dynamicImports.map((bundle) => {
      return <script
        async
        key={bundle.file}
        src={`${assetPrefix}/_next/${bundle.file}`}
        nonce={this.props.nonce || scriptNonce}
        crossOrigin={this.props.crossOrigin || crossOrigin}
      />
    })
  }

  getScripts () {
    const { assetPrefix, files, scriptNonce, __NEXT_DATA__: { crossOrigin } } = this.context._documentProps
    if(!files || files.length === 0) {
      return null
    }

    return files.map((file) => {
      // Only render .js files here
      if(!/\.js$/.exec(file)) {
        return null
      }

      return <script
        key={file}
        src={`${assetPrefix}/_next/${file}`}
        nonce={this.props.nonce || scriptNonce}
        async
        crossOrigin={this.props.crossOrigin || crossOrigin}
      />
    })
  }

  static getInlineScriptSource (documentProps) {
    const { __NEXT_DATA__ } = documentProps
    return htmlescape(__NEXT_DATA__)
  }

  render () {
    const { staticMarkup, assetPrefix, scriptNonce, devFiles, __NEXT_DATA__ } = this.context._documentProps
    const { page, buildId, crossOrigin } = __NEXT_DATA__
    const pagePathname = getPagePathname(page)

    return <Fragment>
      {devFiles ? devFiles.map((file) => <script key={file} src={`${assetPrefix}/_next/${file}`} nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />) : null}
      {staticMarkup ? null : <script id="__NEXT_DATA__" type="application/json" dangerouslySetInnerHTML={{
        __html: NextScript.getInlineScriptSource(this.context._documentProps)
      }} />}
      {page !== '/_error' && <script async id={`__NEXT_PAGE__${page}`} src={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />}
      <script async id={`__NEXT_PAGE__/_app`} src={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />
      <script async id={`__NEXT_PAGE__/_error`} src={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} nonce={this.props.nonce || scriptNonce} crossOrigin={this.props.crossOrigin || crossOrigin} />
      {staticMarkup ? null : this.getDynamicChunks()}
      {staticMarkup ? null : this.getScripts()}
    </Fragment>
  }
}

function getPagePathname (page) {
  if (page === '/') {
    return '/index.js'
  }

  return `${page}.js`
}
