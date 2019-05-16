export default (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })

  const json = JSON.stringify(req.cookies)
  res.end(json)
}
