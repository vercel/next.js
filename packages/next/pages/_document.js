/* eslint-disable */
import React, { Component } from 'react'
import PropTypes from 'prop-types'
import {htmlEscapeJsonString} from '../server/htmlescape'
import flush from 'styled-jsx/server'

export default class Document extends Component {
  static childContextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  static getInitialProps ({ renderPage }) {
    const { html, head } = renderPage()
    const styles = flush()
    return { html, head, styles }
  }

  getChildContext () {
    return {
      _documentProps: this.props,
      // In dev we invalidate the cache by appending a timestamp to the resource URL.
      // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
      // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
      _devOnlyInvalidateCacheQueryString: process.env.NODE_ENV !== 'production' ? '?ts=' + Date.now() : ''
    }
  }

  render () {
    return <html amp={this.props.amphtml ? '' : null}>
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
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
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
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return dynamicImports.map((bundle) => {
      return <link
        rel='preload'
        key={bundle.file}
        href={`${assetPrefix}/_next/${bundle.file}${_devOnlyInvalidateCacheQueryString}`}
        as='script'
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  getPreloadMainLinks () {
    const { assetPrefix, files } = this.context._documentProps
    if (!files || files.length === 0) {
      return null
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return files.map((file) => {
      // Only render .js files here
      if(!/\.js$/.exec(file)) {
        return null
      }

      return <link
        key={file}
        nonce={this.props.nonce}
        rel='preload'
        href={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
        as='script'
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  render () {
    const { ampEnabled, head, styles, amphtml, assetPrefix, __NEXT_DATA__ } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context
    const { page, buildId } = __NEXT_DATA__

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
      {amphtml && <>
        <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1"/>
        <link rel="canonical" href={page} />
        {/* https://www.ampproject.org/docs/fundamentals/optimize_amp#optimize-the-amp-runtime-loading */}
        <link rel="preload" as="script" href="https://cdn.ampproject.org/v0.js" />
        {/* Add custom styles before AMP styles to prevent accidental overrides */}
        {styles && <style amp-custom="" dangerouslySetInnerHTML={{__html: styles.map((style) => style.props.dangerouslySetInnerHTML.__html).join('')}} />}
        <style amp-boilerplate="" dangerouslySetInnerHTML={{__html: `body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`}}></style>
        <noscript><style amp-boilerplate="" dangerouslySetInnerHTML={{__html: `body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`}}></style></noscript>
        <script async src="https://cdn.ampproject.org/v0.js"></script>
      </>}
      {!amphtml && <>
      {ampEnabled && <link rel="amphtml" href={`${page}?amp=1`} />}
      {page !== '/_error' && <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages${getPagePathname(page)}${_devOnlyInvalidateCacheQueryString}`} as='script' nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />}
      <link rel='preload' href={`${assetPrefix}/_next/static/${buildId}/pages/_app.js${_devOnlyInvalidateCacheQueryString}`} as='script' nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
      {this.getPreloadDynamicChunks()}
      {this.getPreloadMainLinks()}
      {this.getCssLinks()}
      {styles || null}
      </>}
    </head>
  }
}

export class Main extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
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
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string
  }

  getDynamicChunks () {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return dynamicImports.map((bundle) => {
      return <script
        async
        key={bundle.file}
        src={`${assetPrefix}/_next/${bundle.file}${_devOnlyInvalidateCacheQueryString}`}
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  getScripts () {
    const { assetPrefix, files } = this.context._documentProps
    if (!files || files.length === 0) {
      return null
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return files.map((file) => {
      // Only render .js files here
      if(!/\.js$/.exec(file)) {
        return null
      }

      return <script
        key={file}
        src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
        nonce={this.props.nonce}
        async
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
      />
    })
  }

  static getInlineScriptSource (documentProps) {
    const {__NEXT_DATA__} = documentProps
    try {
      const data = JSON.stringify(__NEXT_DATA__)
      return htmlEscapeJsonString(data)
    } catch(err) {
      if(err.message.indexOf('circular structure')) {
        throw new Error(`Circular structure in "getInitialProps" result of page "${__NEXT_DATA__.page}". https://err.sh/zeit/next.js/circular-structure`)
      }
      throw err
    }
  }

  render () {
    const { staticMarkup, assetPrefix, amphtml, devFiles, __NEXT_DATA__ } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    if(amphtml) {
      return null
    }

    const { page, buildId } = __NEXT_DATA__

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin) console.warn('Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated')
    }

    return <>
      {devFiles ? devFiles.map((file) => <script key={file} src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />) : null}
      {staticMarkup ? null : <script id="__NEXT_DATA__" type="application/json" nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} dangerouslySetInnerHTML={{
        __html: NextScript.getInlineScriptSource(this.context._documentProps)
      }} />}
      {page !== '/_error' && <script async id={`__NEXT_PAGE__${page}`} src={`${assetPrefix}/_next/static/${buildId}/pages${getPagePathname(page)}${_devOnlyInvalidateCacheQueryString}`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />}
      <script async id={`__NEXT_PAGE__/_app`} src={`${assetPrefix}/_next/static/${buildId}/pages/_app.js${_devOnlyInvalidateCacheQueryString}`} nonce={this.props.nonce} crossOrigin={this.props.crossOrigin || process.crossOrigin} />
      {staticMarkup ? null : this.getDynamicChunks()}
      {staticMarkup ? null : this.getScripts()}
    </>
  }
}

function getPagePathname (page) {
  if (page === '/') {
    return '/index.js'
  }

  return `${page}.js`
}
