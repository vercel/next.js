export default (req, res) => {
  console.log('WOAH')
  res.writeHead(302, { Location: '/' })
  res.end()
}
