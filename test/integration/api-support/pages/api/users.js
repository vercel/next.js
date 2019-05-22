export default ({ query }, res) => {
  const users = [{ name: 'Tim' }, { name: 'Jon' }]

  const response = query.name
    ? users.filter(user => user.name === query.name)
    : users

  res.json(200, response)
}
