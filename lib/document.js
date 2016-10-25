import React from 'react'
import htmlescape from 'htmlescape'
import pkg from '../../package.json'

export default ({ head, css, html, data, dev, staticMarkup }) => {
  let script
  if (!staticMarkup) {
    if (dev) {
      script = <script type='text/javascript' src='/_next/next-dev.bundle.js' />
    } else {
      script = <script dangerouslySetInnerHTML={{ __html: `
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
            document.head.appendChild(script)
          }
        })()
    `}} />
    }
  }

  return <html>
    <head>
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{ __html: '__NEXT_DATA__ = ' + htmlescape(data) }} />}
      {script}
    </body>
  </html>
}
