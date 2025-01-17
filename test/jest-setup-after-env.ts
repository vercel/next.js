// @ts-ignore
import * as matchers from 'jest-extended'
import '@testing-library/jest-dom'
expect.extend(matchers)

// A default max-timeout of 90 seconds is allowed
// per test we should aim to bring this down though
jest.setTimeout((process.platform === 'win32' ? 180 : 60) * 1000)

// Polyfill for `using` https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html
if (!Symbol.dispose) {
  Object.defineProperty(Symbol, 'dispose', {
    value: Symbol('Symbol.dispose'),
  })
}

if (!Symbol.asyncDispose) {
  Object.defineProperty(Symbol, 'asyncDispose', {
    value: Symbol('Symbol.asyncDispose'),
  })
}
