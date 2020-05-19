export default (req, res) => {
  res.statusCode = 200
  res.send((1n + 2n).toString())
}
