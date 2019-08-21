// This is not production ready, (except with providers that ensure a secure host, like Now)
// For production consider setting the host in an environment variable
export default function getHost (req) {
  if (typeof window === 'undefined') {
    const { host } = req.headers

    if (process.env.NODE_ENV === 'production') {
      return `https://${host}`
    }
    return `http://${host}`
  }
  return ''
}
