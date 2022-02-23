export const config = {
  api: {
    bodyLimit: false,
  },
}

export default (req, res) => {
  let body = '.'.repeat(5 * 1024 * 1024)
  res.send(body)
}
