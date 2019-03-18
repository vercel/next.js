import React, { Component, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PropTypes from 'prop-types'
import htmlescape from 'htmlescape'

// Hack to prevent duplicate script exec under Safari 10.3
// https://gist.github.com/samthor/64b114e4a4f539915a95b91ffd340acc#file-safari-nomodule-js-L18
const safariNoModule =
  '(function(d,c,s){c=d.createElement("script");if(!("noModule"in c)&&"onbeforeload"in c){d.addEventListener("beforeload",function(e){if(e.target===c){s=true}else if(!e.target.hasAttribute("nomodule")||!s){return}e.preventDefault()},true);c.type="module";c.src=".";d.head.appendChild(c);c.remove()}})(document);'

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

  getChunkPreloadLink ({ file, module }) {
    let { publicPath } = this.context._documentProps.__NEXT_DATA__

    // Give preference to modern bundle for preloading (since we can't do nomodule for
    // legacy vs. not and browsers will download both)
    return (
      module ? `<link rel=preload href="${publicPath}${file}" as=script crossorigin="anonymous">` : ''
    )
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
    const { children, ...rest } = this.props

    const headMarkup = renderToStaticMarkup(
      <Fragment>
        {styles || null}
        {children}
      </Fragment>
    )

    return <head {...rest} dangerouslySetInnerHTML={{
      __html: `
${this.getPreloadMainLinks()}
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

  getScripts () {
    const { __NEXT_DATA__, entrypoints } = this.context._documentProps
    const { pathname } = __NEXT_DATA__

    let scripts = scriptsForEntry(pathname, entrypoints)

    // In the production mode, we have a single asset with all the JS content.
    // So, we can load the script with async
    return scripts.map(({ file, module }) => {
      let { publicPath } = this.context._documentProps.__NEXT_DATA__

      return (
        <script
          key={file}
          type={module ? 'module' : 'text/javascript'}
          noModule={!module}
          src={`${publicPath}${file}`}
          crossOrigin='anonymous'
          async
        />
      )
    })
  }

  render () {
    const { __NEXT_DATA__ } = this.context._documentProps

    return <div>
      <script nonce={this.props.nonce} dangerouslySetInnerHTML={{
        __html: `module={};__NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)};${safariNoModule}`
      }} />
      {this.getScripts()}
    </div>
  }
}
