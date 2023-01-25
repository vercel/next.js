import * as matchers from 'jest-extended'
expect.extend(matchers)

// A default max-timeout of 90 seconds is allowed
// per test we should aim to bring this down though
jest.setTimeout((process.platform === 'win32' ? 180 : 90) * 1000)

// Silence logs in CI
const origLog = console.log
console.log = (...args) => {
  if (process.env.CI) return
  origLog(...args)
}
