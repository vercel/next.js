export default (req, res) => {
  return res
    .status(200)
    .setHeader('headers-from-serverless', '1')
    .json(req.headers)
}
