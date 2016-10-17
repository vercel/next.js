import React from 'react'
import htmlescape from 'htmlescape'

export default ({ head, css, html, data, dev, staticMarkup }) => {
  return <html>
    <head>
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
      <style data-aphrodite='' dangerouslySetInnerHTML={{ __html: css.content }} />
    </head>
    <body>
      <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{ __html: '__NEXT_DATA__ = ' + htmlescape(data) }} />}
      {staticMarkup ? null : <script type='text/javascript' src={dev ? '/_next/next-dev.bundle.js' : '/_next/next.bundle.js'} />}
    </body>
  </html>
}
