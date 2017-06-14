const React = require('react')
const express = require('express')
const next = require('next')
const {
  render,
  template
} = require('rapscallion')

const { Head, NextScript } = require('next/document')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()

  server.get('/a', (req, res) => {
    app.renderToParts(req, res, '/hashes', req.query, {
      renderMethod: render
    })
      .then((data) => {
        // This template effectively replaces `document.js` in next.
        const responseRenderer = template`
          <!DOCTYPE html>
          <html>
            ${render(React.createElement(Head, {_documentProps: data.docProps}))}
            <body>
              <div id="__next">${data.html}</div>
              <div id="__next-error">${data.errorHtml}</div>

              <script>
                document.querySelector("#__next > [data-reactroot]").setAttribute("data-react-checksum", "${() => data.html.checksum()}")
              </script>

              ${render(React.createElement(NextScript, {_documentProps: data.docProps}))}
            </body>
          </html>
        `

        // You could also return a stream and pipe it to `res`.
        responseRenderer
          .toPromise()
          .then((data) => {
            res.end(data)
          })
      })
  })

  server.get('/b', (req, res) => {
    // Normal next.js rendering.
    return app.render(req, res, '/hashes', req.query)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
