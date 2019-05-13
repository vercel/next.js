import url from 'url'

export default (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })

  const { query } = url.parse(req.url, true)

  const users = [{ name: 'Tim' }, { name: 'Jon' }]

  const response =
    query && query.name ? users.filter(user => user.name === query.name) : users

  const json = JSON.stringify(response)
  res.end(json)
}
