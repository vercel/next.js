// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

export default (req, res) => {
  res.clearPreviewData({})
  res.send('disabled preview')
}
