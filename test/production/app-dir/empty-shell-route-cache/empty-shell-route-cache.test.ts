import fs from 'fs/promises'
import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('empty-shell-route-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()
  })

  async function getRouteArtifactMtimes(route: string) {
    const routeMeta = JSON.parse(
      await next.readFile(`.next/server/app/${route}.meta`)
    )
    const files = [
      `${route}.html`,
      `${route}.meta`,
      ...routeMeta.segmentPaths.map(
        (segmentPath: string) => `${route}.segments${segmentPath}.segment.rsc`
      ),
    ]

    return Object.fromEntries(
      await Promise.all(
        files.map(async (file) => {
          const stat = await fs.stat(
            path.join(next.testDir, '.next/server/app', file)
          )

          return [file, stat.mtimeMs]
        })
      )
    )
  }

  it('should emit both routes as partially static build artifacts', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )

    expect(prerenderManifest.routes['/with-suspense'].renderingMode).toBe(
      'PARTIALLY_STATIC'
    )
    expect(prerenderManifest.routes['/without-suspense'].renderingMode).toBe(
      'PARTIALLY_STATIC'
    )

    expect(await next.readFile('.next/server/app/with-suspense.html')).not.toBe(
      ''
    )
    expect(await next.readFile('.next/server/app/without-suspense.html')).toBe(
      ''
    )

    const withoutSuspenseMeta = JSON.parse(
      await next.readFile('.next/server/app/without-suspense.meta')
    )
    expect(withoutSuspenseMeta.postponed).toBeTruthy()
  })

  describe('after next start', () => {
    beforeAll(async () => {
      await next.start({ skipBuild: true })
    })

    afterAll(async () => {
      await next.stop()
    })

    it.each([
      ['/with-suspense', 'with-suspense'],
      ['/without-suspense', 'without-suspense'],
    ])(
      'should not rewrite %s build artifacts on the first request',
      async (pathname, route) => {
        const before = await getRouteArtifactMtimes(route)
        const response = await next.fetch(pathname)
        const after = await getRouteArtifactMtimes(route)

        expect(response.status).toBe(200)
        expect(after).toEqual(before)
      }
    )
  })
})
