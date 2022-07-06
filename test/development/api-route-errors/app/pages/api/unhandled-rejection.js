export default function unhandledRejection(req, res) {
  Promise.reject(new Error('unhandled rejection'))
  res.send('hello')
}
