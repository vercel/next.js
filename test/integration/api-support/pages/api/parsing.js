export const config = {
  api: {
    bodyParser: true
  }
}

export default (req, res) => {
  if (req.body) {
    res.status(200).json({ message: 'Parsed body' })
  }
}
