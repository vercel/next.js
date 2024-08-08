export default (req, res) => {
  if (
    process.env.CUSTOM_SERVER &&
    typeof req.fromCustomServer === 'undefined'
  ) {
    throw new Error('missing custom req field')
  }

  if (req.method === 'POST') {
    res.status(200).json(req.body)
  }
}
