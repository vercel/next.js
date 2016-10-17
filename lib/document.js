import React, { Component, PropTypes } from 'react'
import htmlescape from 'htmlescape'

export default class Document extends Component {
  static childContextTypes = {
    _documentProps: PropTypes.any
  }

  getChildContext () {
    return {
      _documentProps: this.props
    }
  }

  render () {
    return <html>
      <Head />
      <body>
        <Main />
        <DevTools />
        <NextScript />
      </body>
    </html>
  }
}

export function Head (props, context) {
  const { head, css } = context._documentProps
  const h = (head || [])
  .map((h, i) => React.cloneElement(h, { key: '_next' + i }))
  return <head>
    {h}
    <style data-aphrodite='' dangerouslySetInnerHTML={{ __html: css.content }} />
  </head>
}

Head.contextTypes = { _documentProps: PropTypes.any }

export function Main (props, context) {
  const { html, data, staticMarkup } = context._documentProps
  return <div>
    <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
    {staticMarkup ? null : <script dangerouslySetInnerHTML={{ __html: '__NEXT_DATA__ = ' + htmlescape(data) }} />}
  </div>
}

Main.contextTypes = { _documentProps: PropTypes.any }

export function DevTools (props, context) {
  const { hotReload } = context._documentProps
  return hotReload ? <div id='__next-hot-code-reloading-indicator' /> : null
}

DevTools.contextTypes = { _documentProps: PropTypes.any }

export function NextScript (props, context) {
  const { dev, staticMarkup } = context._documentProps
  if (staticMarkup) return null
  const src = !dev ? '/_next/next.bundle.js' : '/_next/next-dev.bundle.js'
  return <script type='text/javascript' src={src} />
}

NextScript.contextTypes = { _documentProps: PropTypes.any }
