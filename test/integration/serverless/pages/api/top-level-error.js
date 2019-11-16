throw new Error('top-level-oops')

// eslint-disable-next-line
export default (req, res) => {
  res.end('hi')
}
