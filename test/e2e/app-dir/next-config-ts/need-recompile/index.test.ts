import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-need-recompile', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should set distDir as dist', () => {
    expect(
      existsSync(join(next.testDir, 'dist', 'next.compiled.config.mjs'))
    ).toBe(true)
  })
})
