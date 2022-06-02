export default (req, res) => {
  console.log(process.env.where_is_it)
  res.end('done')
}
