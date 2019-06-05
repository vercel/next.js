export default ({ query, method }, res) => {
  if (method === 'POST') {
    res.status(200).json([{ title: query.title }])
  } else {
    res.status(200).json([{ title: 'Cool Post!' }])
  }
}
