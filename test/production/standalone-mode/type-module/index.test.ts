import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import { fork } from 'child_process'
import fs from 'fs-extra'
import { fetchViaHTTP, waitFor } from 'next-test-utils'

describe('type-module', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.mjs': `export default ${JSON.stringify({
          output: 'standalone',
        })}`,
      },
      packageJson: { type: 'module' },
    })
    await next.stop()
  })

  afterAll(() => next.destroy())

  it('should work', async () => {
    const standalonePath = join(next.testDir, '.next/standalone')
    const staticSrc = join(next.testDir, '.next/static')

    const staticDest = join(standalonePath, '.next/static')

    await fs.move(staticSrc, staticDest)

    const serverFile = join(standalonePath, 'server.mjs')
    const childProcess = fork(serverFile)
    try {
      await waitFor(1000)
      const res = await fetchViaHTTP(3000, '/')
      expect(await res.text()).toContain('hello world')
    } finally {
      childProcess.kill()
    }
  })
})
