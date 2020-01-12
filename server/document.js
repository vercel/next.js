import React, { Component, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'
import { modernBrowsers } from './compile-targets'

function scriptsForEntry (pathname, entrypoints) {
  const entry = entrypoints[`pages${pathname}.js`]

  if (entry) {
    return entry.chunks
      .reduce((prev, { file, module }) => prev.concat({ file, module }), [])
      .filter(({ name }) => !/hot-update/.test(name))
  } else {
    return []
  }
}

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml } = renderPage()
    return { html, head, errorHtml }
  }

  static childContextTypes = {
    _documentProps: PropTypes.any
  };

  constructor (props) {
    super(props)

    const { userAgent } = props
    const browserChecks = {
      ios:
        /iPhone OS ([_0-9]+)/.exec(userAgent) &&
        parseFloat(RegExp.$1.replace(/_/, '.')),
      chrome: !/Edge\//.test(userAgent) && /Chrome\/([.0-9]*)/.exec(userAgent) && parseFloat(RegExp.$1)
    }

    this.serveModern =
      browserChecks.ios >= modernBrowsers.ios ||
      browserChecks.chrome >= modernBrowsers.chrome
  }

  getChildContext () {
    return { _documentProps: this.props }
  }

  render () {
    return <html>
      <Head serveModern={this.serveModern} />
      <body>
        <Main />
        <NextScript serveModern={this.serveModern} />
      </body>
    </html>
  }
}

export class Head extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  getChunkPreloadLink ({ file, module }) {
    let { publicPath } = this.context._documentProps.__NEXT_DATA__

    // Give preference to modern bundle for preloading (since we can't do nomodule for
    // legacy vs. not and browsers will download both)
    return !!module === !!this.props.serveModern
      ? `<link rel=preload href="${publicPath}${file}" as=script crossorigin=anonymous>`
      : ''
  }

  getPreloadMainLinks () {
    const { __NEXT_DATA__, entrypoints } = this.context._documentProps
    const { pathname } = __NEXT_DATA__

    let scripts = scriptsForEntry(pathname, entrypoints)

    // In the production mode, we have a single asset with all the JS content.
    return scripts.map((name) => this.getChunkPreloadLink(name)).join('')
  }

  render () {
    const { head, styles } = this.context._documentProps
    const { children, serveModern, amp, ...rest } = this.props

    const headMarkup = renderToStaticMarkup(
      <Fragment>
        {styles || null}
        {children}
      </Fragment>
    )

    return <head {...rest} dangerouslySetInnerHTML={{
      __html: `
${amp ? '' : this.getPreloadMainLinks()}
${head || ''}
${headMarkup}
    ` }} />
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
      <div id='__next' className={className} dangerouslySetInnerHTML={{ __html: errorHtml || html }} />
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

  getScripts () {
    const { serveModern } = this.props
    const { __NEXT_DATA__, entrypoints } = this.context._documentProps
    const { pathname } = __NEXT_DATA__

    let scripts = scriptsForEntry(pathname, entrypoints)

    // In the production mode, we have a single asset with all the JS content.
    // So, we can load the script with async
    return scripts.map(({ file, module }) => {
      let { publicPath } = this.context._documentProps.__NEXT_DATA__

      if ((!module && serveModern) || (module && !serveModern)) {
        return
      }

      return (
        <script
          key={file}
          type={module ? 'module' : 'text/javascript'}
          src={`${publicPath}${file}`}
          crossOrigin='anonymous'
          async
        />
      )
    }).filter(Boolean)
  }

  render () {
    const { __NEXT_DATA__ } = this.context._documentProps
    const { pathname } = __NEXT_DATA__

    const scripts = this.getScripts()
    if (!scripts.length && pathname !== '/_error') {
      throw new Error(
        `No scripts found for ${pathname}. Please check path and SKIP_LEGACY filter`
      )
    }

    return <Fragment>
      <script nonce={this.props.nonce} dangerouslySetInnerHTML={{
        __html: `module={};__NEXT_DATA__=${htmlescape(__NEXT_DATA__)}`
      }} />
      {scripts}
    </Fragment>
  }
}
