export const config = {
  api: {
    bodyParser: false,
  },
}

export default (req, res) => {
  if (!req.body) {
    let buffer = ''
    req.on('data', chunk => {
      buffer += chunk
    })

    req.on('end', () => {
      res.status(200).json(JSON.parse(Buffer.from(buffer).toString()))
    })
  }
}
