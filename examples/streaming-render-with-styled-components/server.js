const React = require('react')
const { renderToStaticNodeStream } = require('react-dom/server')
const express = require('express')
const ST = require('stream-template').encoding('utf8')
const next = require('next')

const { Head, NextScript } = require('next/document')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  server.get('/a', (req, res) => {
    app
      .renderToParts(req, res, '/hashes', req.query, {
        renderMethod: renderToStaticNodeStream
      })
      .then(({ docProps = {} }) => {
        const { htmlStream = '', errorHtmlStream = '' } = docProps

        // This template effectively replaces `document.js` in next.
        const responseRenderer = ST`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            ${renderToStaticNodeStream(
              React.createElement(Head, { _documentprops: docProps })
            )}

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
            />
          </head>

          <body>
            <div id="root">
              <div id="__next">${htmlStream}</div>
              <div id="__next-error">${errorHtmlStream}</div>
            </div>

            ${renderToStaticNodeStream(
              React.createElement(NextScript, { _documentprops: docProps })
            )}
          </body>
        </html>
      `

        responseRenderer.pipe(res)
      })
  })

  server.get('/b', (req, res) => {
    // Normal next.js rendering.
    return app.render(req, res, '/hashes', req.query)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, err => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
