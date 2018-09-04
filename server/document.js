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

  static getInitialProps ({ renderPage, csp }) {
    const { html, head, errorHtml, buildManifest } = renderPage()
    const styles = flush({ nonce: csp && csp.nonce ? csp.nonce : undefined })

    return { html, head, errorHtml, styles, buildManifest }
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
        rel='stylesheet'
        href={`${assetPrefix}/_next/${file}`}
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
        rel='preload'
        href={`${assetPrefix}/_next/${file}`}
        as='script'
      />
    })
  }

  render () {
    const { head, styles, csp, staticMarkup, assetPrefix, __NEXT_DATA__ } = this.context._documentProps
    const { page, pathname, buildId } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)

    return <head {...this.props}>
      { (staticMarkup && !csp.isDisabled) ? <meta http-equiv="Content-Security-Policy" content={csp.policy} /> : '' }
      { csp.nonce ? <meta property="csp-nonce" content={csp.nonce} /> : '' }
      <link rel='preload' href={`${assetPrefix}/_next/static/runtime/bootstrap.js`} as='script' />
      {(head || []).map((h, i) => React.cloneElement(h, { key: h.key || i }))}
      {page !== '/_error' && <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} as='script' />}
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} as='script' />
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} as='script' />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {this.getCssLinks()}
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
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getDynamicChunks () {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    return dynamicImports.map((bundle) => {
      return <script
        async
        key={bundle.file}
        src={`${assetPrefix}/_next/${bundle.file}`}
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
        async
      />
    })
  }

  render () {
    const { staticMarkup, assetPrefix, devFiles, __NEXT_DATA__ } = this.context._documentProps
    const { page, pathname, buildId } = __NEXT_DATA__
    const pagePathname = getPagePathname(pathname)
    __NEXT_DATA__.cleanPathname = htmlescape(__NEXT_DATA__.pathname);

    return <Fragment>
      {staticMarkup ? null : <script
        id="server-app-state"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ ...__NEXT_DATA__ }).replace(
            /<\/script>/g,
            '%3C/script%3E'
          ),
        }}
      />}
      <script
        src={`${assetPrefix}/_next/static/runtime/bootstrap.js`}
      />
      {devFiles ? devFiles.map((file) => <script key={file} src={`${assetPrefix}/_next/${file}`} />) : null}
      {page !== '/_error' && <script async id={`__NEXT_PAGE__${pathname}`} src={`${assetPrefix}/_next/static/${buildId}/pages${pagePathname}`} />}
      <script async id={`__NEXT_PAGE__/_app`} src={`${assetPrefix}/_next/static/${buildId}/pages/_app.js`} />
      <script async id={`__NEXT_PAGE__/_error`} src={`${assetPrefix}/_next/static/${buildId}/pages/_error.js`} />
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
