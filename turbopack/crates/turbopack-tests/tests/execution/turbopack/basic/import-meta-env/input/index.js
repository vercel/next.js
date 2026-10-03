const env = import.meta.env
const { DEV, PROD, MODE, BASE_URL, SSR } = env

it('exposes built-in import.meta.env values', () => {
  expect({ DEV, PROD, MODE, BASE_URL, SSR }).toEqual({
    DEV: false,
    PROD: true,
    MODE: 'production',
    BASE_URL: '/',
    SSR: true,
  })
  expect(import.meta.env['MODE']).toBe('production')
  expect(env.UNKNOWN).toBe(undefined)
})

if (import.meta.env.DEV) {
  require('this-development-package-does-not-exist')
}

if (!import.meta.env.PROD) {
  require('this-non-production-package-does-not-exist')
}

if (!import.meta.env.SSR) {
  require('this-browser-package-does-not-exist')
}

if (import.meta.env.DEV && import.meta.env.PROD) {
  require('this-impossible-package-does-not-exist')
}
