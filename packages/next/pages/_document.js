/* eslint-disable */
import React, { Component } from 'react'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'
import flush from 'styled-jsx/server'

const Fragment = React.Fragment || function Fragment ({ children }) {
  return <div>{children}</div>
}

export default class Document extends Component {
  static childContextTypes = {
    _documentProps: PropTypes.any
  }

  static getInitialProps ({ renderPage }) {
    const { html, head } = renderPage()
    const styles = flush()
    return { html, head, styles }
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
    const { assetPrefix, files } = this.context._documentProps
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
        nonce={this.props.nonce}
        rel='stylesheet'
        href={`${assetPrefix}/_next/${file}`}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  getPreloadDynamicChunks () {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    return dynamicImports.map((bundle) => {
      return <link
        rel='preload'
        key={bundle.file}
        href={`${assetPrefix}/_next/${bundle.file}`}
        as='script'
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  getPreloadMainLinks () {
    const { assetPrefix, files } = this.context._documentProps
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
        nonce={this.props.nonce}
        rel='preload'
        href={`${assetPrefix}/_next/${file}`}
        as='script'
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  render () {
    const { head, styles, assetPrefix, __NEXT_DATA__ } = this.context._documentProps
    const { page, buildId } = __NEXT_DATA__
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
      if (this.props.crossOrigin) console.warn('Warning: `Head` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated')
    }

    return <head {...this.props}>
      {children}
      {head}
      {page !== '/_error' && <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} as='script' nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />}
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} as='script' nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} as='script' nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {this.getCssLinks()}
      {styles || null}
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
    const { dynamicImports, assetPrefix } = this.context._documentProps
    return dynamicImports.map((bundle) => {
      return <script
        async
        key={bundle.file}
        src={`${assetPrefix}/_next/${bundle.file}`}
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  getScripts () {
    const { assetPrefix, files } = this.context._documentProps
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
        nonce={this.props.nonce}
        async
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  static getInlineScriptSource (documentProps) {
    const { __NEXT_DATA__ } = documentProps
    return htmlescape(__NEXT_DATA__)
  }

  render () {
    const { staticMarkup, assetPrefix, devFiles, __NEXT_DATA__ } = this.context._documentProps
    const { page, buildId } = __NEXT_DATA__
    const pagePathname = getPagePathname(page)

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin) console.warn('Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated')
    }

    return <Fragment>
      {devFiles ? devFiles.map((file) => <script key={file} src={`${assetPrefix}/_next/${file}`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />) : null}
      {staticMarkup ? null : <script id="__NEXT_DATA__" type="application/json" nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} dangerouslySetInnerHTML={{
        __html: NextScript.getInlineScriptSource(this.context._documentProps)
      }} />}
      {page !== '/_error' && <script async id={`__NEXT_PAGE__${page}`} src={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />}
      <script async id={`__NEXT_PAGE__/_app`} src={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
      <script async id={`__NEXT_PAGE__/_error`} src={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
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
