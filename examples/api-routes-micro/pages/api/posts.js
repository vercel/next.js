import micro from 'micro'

const posts = [
  {
    title: 'Next.js is awesome'
  },
  {
    title: 'API support is really great'
  }
]

export default micro((req, res) => {
  res.status(200).json(posts)
})
