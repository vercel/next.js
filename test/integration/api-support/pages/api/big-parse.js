export const config = {
  api: {
    bodySizeLimit: '5mb'
  }
}

export default (req, res) => {
  res.status(200).json(req.body)
}
