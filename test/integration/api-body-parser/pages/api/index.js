export default ({ method, body }, res) => {
  if (method === 'POST') {
    res.status(200).json(body)
  }
}
