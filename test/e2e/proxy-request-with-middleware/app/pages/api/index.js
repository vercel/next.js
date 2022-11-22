import request from 'request'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req, res) {
  return req
    .pipe(
      request(
        `http://${
          // node v18 resolves to IPv6 by default so force IPv4
          process.version.startsWith('v18.') && !process.env.VERCEL_URL
            ? `127.0.0.1:${req.headers.host.split(':').pop() || ''}`
            : req.headers.host
        }${req.url}/post`,
        {
          followAllRedirects: false,
          followRedirect: false,
          gzip: true,
          json: false,
        }
      )
    )
    .pipe(res)
}
