/* eslint-env jest */
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

describe('JSON Serialization', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      test('should fail with original error', async () => {
        const { code, stderr } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('Do not know how to serialize a BigInt')
      })
    }
  )
})
