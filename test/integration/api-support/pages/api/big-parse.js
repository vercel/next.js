export const config = {
  api: {
    bodyParser: {
      bodySizeLimit: '5mb'
    }
  }
}

export default (req, res) => {
  res.status(200).json(req.body)
}
