import ciEnvironment from 'ci-info'

const { isCI: _isCI, name: _name } = ciEnvironment

const isZeitNow = !!process.env.NOW_BUILDER

export const isCI = isZeitNow || _isCI
export const name = isZeitNow ? 'ZEIT Now' : _name
