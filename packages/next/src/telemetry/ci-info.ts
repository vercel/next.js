import ciEnvironment from 'next/dist/compiled/ci-info'

const { isCI: _isCI, name: _name } = ciEnvironment

const isZeitNow = !!process.env.NOW_BUILDER

const envStack = process.env.STACK
const isHeroku =
  typeof envStack === 'string' && envStack.toLowerCase().includes('heroku')

export const isCI = isZeitNow || isHeroku || _isCI
export const name = isZeitNow ? 'ZEIT Now' : isHeroku ? 'Heroku' : _name

// This boolean indicates if the CI platform has first-class Next.js support,
// which allows us to disable certain messages which do not require their
// action.
export const hasNextSupport = Boolean(isZeitNow)
