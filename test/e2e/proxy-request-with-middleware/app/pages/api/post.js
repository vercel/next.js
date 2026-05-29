export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req, res) {
  return res.json({
    method: req.method,
    headers: req.headers,
  })
}
