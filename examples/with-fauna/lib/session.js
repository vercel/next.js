import cookieSession from 'micro-cookie-session'

const session = cookieSession({
  name: 'session',
  keys: [process.env.SESSION_KEY],
  maxAge: 24 * 60 * 60 * 1000,
})

export default function wrapper(req, res) {
  session(req, res)
}
