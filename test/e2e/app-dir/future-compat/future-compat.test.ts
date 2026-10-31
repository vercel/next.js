import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('future-compat', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('serves requests without deprecated APIs', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello world')
  })

  it('throws on deprecated Node.js APIs only in future compatibility mode', async () => {
    const futureCompat = await gate((conditions) => conditions.futureCompat)
    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/deprecated')
    // Node throws deprecations asynchronously, outside the route handler's promise.
    // Next.js logs the uncaught exception without changing the successful response.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      value: 'future-compat',
      throwDeprecation: futureCompat,
    })

    // The deploy harness exposes build logs, not runtime logs.
    if (!isNextDeploy) {
      await retry(() => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
          .replaceAll('\\', '/')
          .replace(/uncaughtException: +/g, 'uncaughtException: ')
          .replace(/( at .*):\d+:\d+/g, '$1:<line>:<col>')
          // Raw warnings and next-start errors do not have sourcemapped frames.
          .replace(
            /\n {4}at [^\n]*(?:\.next\/(?:dev\/)?server\/|webpack-internal:)[^\n]*/g,
            '\n    at <bundled frame>'
          )
        if (futureCompat) {
          if (isNextDev) {
            expect(output).toContain(
              'uncaughtException: DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.' +
                '\n    at GET (app/deprecated/route.ts:<line>:<col>)' +
                '\n  4 |   await connection()' +
                '\n  5 |   return Response.json({' +
                "\n> 6 |     value: new Buffer('future-compat').toString()," +
                '\n    |            ^' +
                '\n  7 |     throwDeprecation: process.throwDeprecation ?? false,' +
                '\n  8 |   })' +
                '\n  9 | } {' +
                "\n  code: 'DEP0005'" +
                '\n}'
            )
          } else {
            expect(output).toContain(
              'uncaughtException: DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.' +
                '\n    at showFlaggedDeprecation (node:buffer:<line>:<col>)' +
                '\n    at new Buffer (node:buffer:<line>:<col>)' +
                '\n    at <bundled frame>'
            )
          }
        } else {
          expect(output).toContain(
            '[DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.' +
              '\n    at showFlaggedDeprecation (node:buffer:<line>:<col>)' +
              '\n    at new Buffer (node:buffer:<line>:<col>)' +
              '\n    at <bundled frame>'
          )
          expect(output).not.toContain(
            'uncaughtException: DeprecationWarning: Buffer() is deprecated'
          )
        }
      })
    }
  })
})
