import url from 'url'

export default (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })

  if (req.method === 'POST') {
    const { query } = url.parse(req.url, true)
    const json = JSON.stringify([{ title: query.title }])
    res.end(json)
  } else {
    const json = JSON.stringify([{ title: 'Cool Post!' }])
    res.end(json)
  }
}
