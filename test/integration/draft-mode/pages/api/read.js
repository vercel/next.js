export default (req, res) => {
  const { draftMode } = req
  res.json({ draftMode })
}
