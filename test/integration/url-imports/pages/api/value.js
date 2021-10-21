import value from 'http://localhost:12345/value4.js'

export default (req, res) => {
  res.json({ value: value })
}
