import React from 'react'
import htmlescape from 'htmlescape'

export default ({ head, css, html, data, dev, staticMarkup, cdn }) => {
  return <html>
    <head>
      {(head || []).map((h, i) => React.cloneElement(h, { key: i }))}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
      {staticMarkup ? null : <script dangerouslySetInnerHTML={{
        __html: `__NEXT_DATA__ =${htmlescape(data)}; module={};`
      }} />}
      <script type='text/javascript' src='/_next/main.js' />
    </body>
  </html>
}
