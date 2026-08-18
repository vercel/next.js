export default (req, res) => {
  const { query } = req
  res.status(200).json(query)
}
