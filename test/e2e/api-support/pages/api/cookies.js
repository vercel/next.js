export default (req, res) => {
  res.status(200).send(req.cookies)
}
