export default ({ query }, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })

  const users = [{ name: 'Tim' }, { name: 'Jon' }]

  const response = query.name ? users.filter(user => user.name === query.name) : users

  const json = JSON.stringify(response)
  res.end(json)
}
