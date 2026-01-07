import httpProxy from 'http-proxy'

export default async function handler(req, res) {
  const port = req.headers.host.split(':').pop()
  const proxy = httpProxy.createProxy({
    target: `http://127.0.0.1:${port}/${
      req.query.buildId
        ? `_next/static/${req.query.buildId}/_ssgManifest.js`
        : `user`
    }`,
    ignorePath: true,
  })

  await new Promise((resolve, reject) => {
    proxy.on('error', reject)
    proxy.on('close', resolve)
    proxy.web(req, res)
  })
}
