import * as matchers from 'jest-extended'
expect.extend(matchers)

// Patch jscodeshift testUtils to normalize line endings (fixes Windows CRLF issues)
// The issue: fixture files are checked out with CRLF on Windows, but transforms produce LF
if (process.platform === 'win32') {
  try {
    const testUtils = require('jscodeshift/dist/testUtils')

    // Patch runInlineTest for direct calls
    const originalRunInlineTest = testUtils.runInlineTest
    testUtils.runInlineTest = function (
      module: any,
      options: any,
      input: any,
      expectedOutput: string,
      testOptions?: any
    ) {
      const normalizedExpected = expectedOutput.replace(/\r\n/g, '\n')
      return originalRunInlineTest(
        module,
        options,
        input,
        normalizedExpected,
        testOptions
      )
    }

    // Patch defineTest - it uses internal runTest which we can't patch,
    // so we replace defineTest entirely
    testUtils.defineTest = function (
      dirName: string,
      transformName: string,
      options: any,
      testFilePrefix?: string,
      testOptions?: any
    ) {
      const testName = testFilePrefix
        ? `transforms correctly using "${testFilePrefix}" data`
        : 'transforms correctly'

      describe(transformName, () => {
        it(testName, () => {
          const fs = require('fs')
          const path = require('path')

          const prefix = testFilePrefix || transformName
          const module = require(path.join(dirName, '..', transformName))
          const parser = testOptions?.parser || module.parser
          const extension =
            parser === 'ts' ? 'ts' : parser === 'tsx' ? 'tsx' : 'js'
          const fixtureDir = path.join(dirName, '..', '__testfixtures__')
          const inputPath = path.join(
            fixtureDir,
            prefix + `.input.${extension}`
          )
          const source = fs.readFileSync(inputPath, 'utf8')
          const expectedOutput = fs
            .readFileSync(
              path.join(fixtureDir, prefix + `.output.${extension}`),
              'utf8'
            )
            .replace(/\r\n/g, '\n') // Normalize CRLF to LF

          testUtils.runInlineTest(
            module,
            options,
            { path: inputPath, source },
            expectedOutput,
            testOptions
          )
        })
      })
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
