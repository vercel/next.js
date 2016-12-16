import React, { Component, PropTypes } from 'react'
import htmlescape from 'htmlescape'
import { renderStatic } from 'glamor/server'
import readPkgUp from 'read-pkg-up'

const { pkg } = readPkgUp.sync({
  cwd: __dirname,
  normalize: false
})

export default class Document extends Component {
  static getInitialProps ({ renderPage }) {
    let head
    const { html, css, ids } = renderStatic(() => {
      const page = renderPage()
      head = page.head
      return page.html
    })
    const nextCSS = { css, ids }
    return { html, head, nextCSS }
  }

  static childContextTypes = {
    _documentProps: PropTypes.any
  }

  constructor (props) {
    super(props)
    const { __NEXT_DATA__, nextCSS } = props
    if (nextCSS) __NEXT_DATA__.ids = nextCSS.ids
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

  render () {
    const { head, nextCSS } = this.context._documentProps
    return <head>
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
      {nextCSS ? <style dangerouslySetInnerHTML={{ __html: nextCSS.css }} /> : null}
      {this.props.children}
    </head>
  }
}

export class Main extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { html, __NEXT_DATA__, staticMarkup } = this.context._documentProps
    return <div>
      <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `__NEXT_DATA__ = ${htmlescape(__NEXT_DATA__)}; module={};`
      }} />}
    </div>
  }
}

export class NextScript extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any
  }

  render () {
    const { staticMarkup, dev, cdn } = this.context._documentProps
    return <div>
      {staticMarkup ? null : createClientScript({ dev, cdn })}
      <script type='text/javascript' src='/_next/commons.js' />
    </div>
  }
}

function createClientScript ({ dev, cdn }) {
  if (dev) {
    return <script type='text/javascript' src='/_next/next-dev.bundle.js' />
  }

  if (!cdn) {
    return <script type='text/javascript' src='/_next/next.bundle.js' />
  }

  return <script dangerouslySetInnerHTML={{ __html: `
    (function () {
      load('https://cdn.zeit.co/next.js/${pkg.version}/next.min.js', function (err) {
        if (err) load('/_next/next.bundle.js')
      })
      function load (src, fn) {
        fn = fn || function () {}
        var script = document.createElement('script')
        script.src = src
        script.onload = function () { fn(null) }
        script.onerror = fn
        script.crossorigin = 'anonymous'
        document.body.appendChild(script)
      }
    })()
  `}} />
}
