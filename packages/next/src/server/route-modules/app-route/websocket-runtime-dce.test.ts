import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const nextServerRuntimeDir = path.join(
  __dirname,
  '../../../../dist/compiled/next-server'
)

const appRouteRuntimeFiles = [
  'app-route-experimental.runtime.dev.js',
  'app-route-experimental.runtime.prod.js',
  'app-route-turbo-experimental.runtime.dev.js',
  'app-route-turbo-experimental.runtime.prod.js',
  'app-route-turbo.runtime.dev.js',
  'app-route-turbo.runtime.prod.js',
  'app-route.runtime.dev.js',
  'app-route.runtime.prod.js',
]

describe('precompiled App Route WebSocket marker', () => {
  it('keeps the full NextResponse implementation out of every runtime variant', async () => {
    const emittedRuntimeFiles = (await readdir(nextServerRuntimeDir))
      .filter((file) =>
        /^app-route(?:-[^.]+)*\.runtime\.(?:dev|prod)\.js$/.test(file)
      )
      .sort()

    expect(emittedRuntimeFiles).toEqual(appRouteRuntimeFiles)

    for (const runtimeFile of emittedRuntimeFiles) {
      const runtimePath = path.join(nextServerRuntimeDir, runtimeFile)
      const [runtimeSource, sourceMapSource] = await Promise.all([
        readFile(runtimePath, 'utf8'),
        readFile(`${runtimePath}.map`, 'utf8'),
      ])
      const sourceMap = JSON.parse(sourceMapSource) as {
        sources: string[]
        sourcesContent?: Array<string | null>
      }

      expect(runtimeSource).toContain(
        'next.internal.websocket-upgrade-response'
      )
      expect(runtimeSource).not.toContain('internal response')
      expect(
        sourceMap.sources.filter((source) =>
          source.endsWith(
            '/server/web/spec-extension/websocket-upgrade-response.ts'
          )
        )
      ).toHaveLength(1)
      expect(
        sourceMap.sources.some((source) =>
          source.endsWith('/server/web/spec-extension/response.ts')
        )
      ).toBe(false)
      expect((sourceMap.sourcesContent || []).join('\n')).not.toContain(
        'internal response'
      )
    }
  })
})
