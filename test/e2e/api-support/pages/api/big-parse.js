export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
}

export default (req, res) => {
  res.status(200).json(req.body)
}
