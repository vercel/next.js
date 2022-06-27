export default (req, res) => {
  let body = '.'.repeat(4 * 1024 * 1024)
  res.send(body)
}
