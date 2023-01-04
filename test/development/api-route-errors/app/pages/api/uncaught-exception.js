export default function uncaughtException(req, res) {
  setTimeout(() => {
    throw new Error('uncaught exception')
  }, 0)
  res.send('hello')
}
