import { getPostById } from '../../lib/api'

export default async function preview(req, res) {
  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  // Redirect the user back to the index page.
  res.writeHead(307, { Location: req.headers.referer })
  res.end(`Preview mode enabled!`)
}
