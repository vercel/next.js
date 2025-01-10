/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('Fallback Modules', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('Crypto Application', () => {
        let stdout
        const appDir = join(fixturesDir, 'with-crypto')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should not include crypto', async () => {
          if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
            return
          }

          ;({ stdout } = await nextBuild(appDir, [], {
            stdout: true,
          }))

          console.log(stdout)

          const parsePageSize = (page) =>
            stdout.match(
              new RegExp(` ${page} .*?((?:\\d|\\.){1,} (?:\\w{1,})) `)
            )[1]

          const parsePageFirstLoad = (page) =>
            stdout.match(
              new RegExp(
                ` ${page} .*?(?:(?:\\d|\\.){1,}) .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`
              )
            )[1]

          const indexSize = parsePageSize('/')
          const indexFirstLoad = parsePageFirstLoad('/')

          // expect(parseFloat(indexSize)).toBeLessThanOrEqual(3.1)
          // expect(parseFloat(indexSize)).toBeGreaterThanOrEqual(2)
          expect(indexSize.endsWith('kB')).toBe(true)

          // expect(parseFloat(indexFirstLoad)).toBeLessThanOrEqual(67.9)
          // expect(parseFloat(indexFirstLoad)).toBeGreaterThanOrEqual(60)
          expect(indexFirstLoad.endsWith('kB')).toBe(true)
        })
      })
    }
  )
})
