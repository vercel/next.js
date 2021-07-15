import ciEnvironment from 'next/dist/compiled/ci-info'

const { isCI: _isCI, name: _name } = ciEnvironment

// When VERCEL_ENV is development it means it's running on a local machine
const isVercel =
  process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development'

const envStack = process.env.STACK
const isHeroku =
  typeof envStack === 'string' && envStack.toLowerCase().includes('heroku')

export const isCI = isVercel || isHeroku || _isCI
export const name = isVercel ? 'Vercel' : isHeroku ? 'Heroku' : _name

// This boolean indicates if the CI platform has first-class Next.js support,
// which allows us to disable certain messages which do not require their
// action.
export const hasNextSupport = Boolean(isVercel)
