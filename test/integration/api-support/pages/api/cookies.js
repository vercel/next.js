export default (req, res) => {
  res.send(200, req.cookies)
}
