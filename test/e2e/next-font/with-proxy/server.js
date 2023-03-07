const http = require('http')
const httpProxy = require('next/dist/compiled/http-proxy')

const PROXY_PORT = process.env.PROXY_PORT
const SERVER_PORT = process.env.SERVER_PORT

httpProxy
  .createProxyServer({ target: 'http://localhost:' + SERVER_PORT })
  .listen(PROXY_PORT)

const cssResponse = `
/* cyrillic-ext */
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752FD8Gl-1PK62t.woff2) format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752HT8Gl-1PK62t.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* vietnamese */
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752Fj8Gl-1PK62t.woff2) format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752Fz8Gl-1PK62t.woff2) format('woff2');
  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752GT8Gl-1PKw.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`

const requestedUrls = []
http
  .createServer(function (req, res) {
    if (req.url === '/requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(JSON.stringify(requestedUrls))
      res.end()
      return
    }

    requestedUrls.push(req.url)
    res.writeHead(200, { 'Content-Type': 'text/css' })
    res.write(cssResponse)
    res.end()
  })
  .listen(SERVER_PORT)
