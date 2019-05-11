export default (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })

  const json = JSON.stringify([{ title: 'Cool Post!' }])
  res.end(json)
}
