import * as matchers from 'jest-extended'
expect.extend(matchers)

// Patch jscodeshift testUtils to normalize line endings (fixes Windows CRLF issues)
if (process.platform === 'win32') {
  try {
    const testUtils = require('jscodeshift/dist/testUtils')
    const originalRunInlineTest = testUtils.runInlineTest

    testUtils.runInlineTest = function (
      module: any,
      options: any,
      input: any,
      expectedOutput: string,
      testOptions?: any
    ) {
      // Normalize CRLF to LF in expected output
      const normalizedExpected = expectedOutput.replace(/\r\n/g, '\n')
      return originalRunInlineTest(
        module,
        options,
        input,
        normalizedExpected,
        testOptions
      )
    }
  } catch {
    // jscodeshift not available, skip patching
  }
}

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
