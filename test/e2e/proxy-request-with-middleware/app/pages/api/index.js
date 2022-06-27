import request from 'request'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req, res) {
  return req
    .pipe(
      request(`http://${req.headers.host}${req.url}/post`, {
        followAllRedirects: false,
        followRedirect: false,
        gzip: true,
        json: false,
      })
    )
    .pipe(res)
}
