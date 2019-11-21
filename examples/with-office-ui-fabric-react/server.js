const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const library = require('office-ui-fabric-react/lib-commonjs/Utilities')
const responsiveLib = require('office-ui-fabric-react/lib-commonjs/utilities/decorators/withResponsiveMode')

library.setSSR(true)
library.setRTL(false)
// Assume a large screen.
responsiveLib.setResponsiveMode(responsiveLib.ResponsiveMode.large)

// Hack to prevent issues with office-ui-fabric-react SSR support.
process.__currentId__ = 0
// --

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
