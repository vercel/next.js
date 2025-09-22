import { nextTestSetup } from 'e2e-utils'
import fs from 'node:fs/promises'
import path from 'node:path'

describe('css-server-chunks', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not write CSS chunks for the server', async () => {
    // Fetch all routes to compile them in development
    expect((await next.fetch('/client')).status).toBe(200)
    expect((await next.fetch('/server')).status).toBe(200)
    expect((await next.fetch('/pages')).status).toBe(200)

    let clientChunks = (
      await fs.readdir(path.join(next.testDir, next.distDir, 'static'), {
        recursive: true,
      })
    ).filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    expect(clientChunks).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.css$/)])
    )

    let serverChunks = (
      await Promise.all(
        [`${next.distDir}/server/app`, `${next.distDir}/server/pages`].map(
          (d) =>
            fs.readdir(path.join(next.testDir, d), {
              recursive: true,
              encoding: 'utf8',
            })
        )
      )
    )
      .flat()
      .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    expect(serverChunks).not.toBeEmpty()
    expect(serverChunks).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.css$/)])
    )
  })
})
