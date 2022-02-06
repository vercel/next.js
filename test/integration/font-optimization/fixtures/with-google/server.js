const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')
const server = http.createServer(async (req, res) => {
  let { pathname } = url.parse(req.url)
  pathname = pathname.replace(/\/$/, '')
  let isDataReq = false
  if (pathname.startsWith('/_next/data')) {
    isDataReq = true
    pathname = pathname
      .replace(`/_next/data/${process.env.BUILD_ID}/`, '/')
      .replace(/\.json$/, '')
  }
  console.log('serving', pathname)

  if (pathname === '/favicon.ico') {
    res.statusCode = 404
    return res.end()
  }

  if (pathname.startsWith('/_next/static/')) {
    let prom = Promise.resolve()
    if (pathname.endsWith('.css')) {
      prom = new Promise((resolve) => setTimeout(resolve, 20000))
    }
    prom.then(() => {
      res.write(
        fs.readFileSync(
          path.join(
            __dirname,
            './.next/static/',
            decodeURI(pathname.slice('/_next/static/'.length))
          ),
          'utf8'
        )
      )
      return res.end()
    })
  } else {
    if (pathname === '') {
      pathname = '/index'
    }
    const ext = isDataReq ? 'json' : 'html'
    if (
      fs.existsSync(
        path.join(__dirname, `./.next/serverless/pages${pathname}.${ext}`)
      )
    ) {
      res.write(
        fs.readFileSync(
          path.join(__dirname, `./.next/serverless/pages${pathname}.${ext}`),
          'utf8'
        )
      )
      return res.end()
    }

    let re
    try {
      re = require(`./.next/serverless/pages${pathname}`)
    } catch {
      const d = decodeURI(pathname)
      if (
        fs.existsSync(
          path.join(__dirname, `./.next/serverless/pages${d}.${ext}`)
        )
      ) {
        res.write(
          fs.readFileSync(
            path.join(__dirname, `./.next/serverless/pages${d}.${ext}`),
            'utf8'
          )
        )
        return res.end()
      }

      const routesManifest = require('./.next/routes-manifest.json')
      const { dynamicRoutes } = routesManifest
      dynamicRoutes.some(({ page, regex }) => {
        if (new RegExp(regex).test(pathname)) {
          if (
            fs.existsSync(
              path.join(__dirname, `./.next/serverless/pages${page}.${ext}`)
            )
          ) {
            res.write(
              fs.readFileSync(
                path.join(__dirname, `./.next/serverless/pages${page}.${ext}`),
                'utf8'
              )
            )
            res.end()
            return true
          }

          re = require(`./.next/serverless/pages${page}`)
          return true
        }
        return false
      })
    }
    if (!res.finished) {
      try {
        return await (typeof re.render === 'function'
          ? re.render(req, res)
          : re.default(req, res))
      } catch (e) {
        console.log('FAIL_FUNCTION', e)
        res.statusCode = 500
        res.write('FAIL_FUNCTION')
        res.end()
      }
    }
  }
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
