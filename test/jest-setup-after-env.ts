import * as matchers from 'jest-extended'
expect.extend(matchers)

// Patch jscodeshift testUtils to normalize line endings (fixes Windows CRLF issues)
// The issue: jscodeshift's printer (recast) outputs CRLF on Windows, but test fixtures use LF
// We need to patch both defineTest (which uses internal closure references) and runInlineTest
if (process.platform === 'win32') {
  try {
    const testUtils = require('jscodeshift/dist/testUtils')
    const fs = require('fs')
    const path = require('path')

    // Helper to normalize line endings
    // - Convert CRLF to LF
    // - Remove trailing whitespace from each line (not meaningful for code)
    // - Ensure exactly one trailing newline (POSIX convention for text files)
    //   Using \n*$ to handle case where transform output has no trailing newline
    const normalizeLF = (str: string) =>
      str
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n*$/, '\n')

    // Patch runInlineTest to normalize both transform output and expected
    testUtils.runInlineTest = function (
      module: any,
      options: any,
      input: any,
      expectedOutput: string,
      testOptions?: any
    ) {
      // Normalize input source
      const normalizedInput =
        typeof input === 'object' && input.source
          ? { ...input, source: normalizeLF(input.source) }
          : input
      // Normalize expected output
      const normalizedExpected = normalizeLF(expectedOutput)

      // Run the transform and normalize its output for comparison
      const output = testUtils.applyTransform(
        module,
        options,
        normalizedInput,
        testOptions
      )
      const normalizedOutput =
        typeof output === 'string' ? normalizeLF(output) : output

      // Do the comparison ourselves instead of letting the original do it
      // eslint-disable-next-line jest/no-standalone-expect -- called from within test blocks
      expect(normalizedOutput).toEqual(normalizedExpected)
      return normalizedOutput
    }

    // Replace defineTest entirely since it uses internal closure references
    // that bypass our exports patch
    testUtils.defineTest = function (
      dirName: string,
      transformName: string,
      options: any,
      testFilePrefix?: string,
      testOptions?: { parser?: string }
    ) {
      const testName = testFilePrefix
        ? `transforms correctly using "${testFilePrefix}" data`
        : 'transforms correctly'

      describe(transformName, () => {
        it(testName, () => {
          const fixtureDir = path.join(dirName, '..', '__testfixtures__')
          const prefix = testFilePrefix || transformName
          const module = require(path.join(dirName, '..', transformName))

          // Determine file extension based on parser option
          const parser = testOptions?.parser || module.parser
          const extension =
            parser === 'ts' ? 'ts' : parser === 'tsx' ? 'tsx' : 'js'

          const inputPath = path.join(
            fixtureDir,
            `${prefix}.input.${extension}`
          )
          const outputPath = path.join(
            fixtureDir,
            `${prefix}.output.${extension}`
          )

          const source = normalizeLF(fs.readFileSync(inputPath, 'utf8'))
          const expectedOutput = normalizeLF(
            fs.readFileSync(outputPath, 'utf8')
          )

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
