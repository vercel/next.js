export default ({ query, method }, res) => {
  if (method === 'POST') {
    res.json(200, [{ title: query.title }])
  } else {
    res.json(200, [{ title: 'Cool Post!' }])
  }
}
