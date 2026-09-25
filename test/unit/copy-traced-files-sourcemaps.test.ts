/* eslint-env jest */
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { copyTracedFiles } from 'next/dist/build/utils'

describe('copyTracedFiles sourcemaps', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'standalone-sourcemaps-test-')
    )
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  it('copies sourcemap files alongside traced JS files in distDir', async () => {
    const projectDir = path.join(tempDir, 'app')
    const distDir = path.join(projectDir, '.next')
    const serverChunksDir = path.join(distDir, 'server', 'chunks')

    await fs.mkdir(serverChunksDir, { recursive: true })

    // Create a mock package.json
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-app', version: '1.0.0' })
    )

    // Create a server chunk and its sourcemap
    const chunkFile = path.join(serverChunksDir, 'app-chunk.js')
    const chunkMapFile = path.join(serverChunksDir, 'app-chunk.js.map')
    await fs.writeFile(
      chunkFile,
      '// chunk code\n//# sourceMappingURL=app-chunk.js.map'
    )
    await fs.writeFile(chunkMapFile, '{"version":3,"sources":["app/page.tsx"]}')

    // Create nft.json tracing the chunk
    const relativeChunkPath = path
      .relative(distDir, chunkFile)
      .replace(/\\/g, '/')
    const nextServerNft = path.join(distDir, 'next-server.js.nft.json')
    await fs.writeFile(
      nextServerNft,
      JSON.stringify({
        version: 1,
        files: [relativeChunkPath],
      })
    )

    const middlewareManifest = {
      sortedMiddleware: [],
      middleware: {},
      functions: {},
      version: 2,
    }

    await copyTracedFiles(
      projectDir,
      distDir,
      [],
      undefined,
      projectDir,
      {} as any,
      middlewareManifest as any,
      false,
      false,
      new Set()
    )

    const standaloneDir = path.join(distDir, 'standalone')
    const standaloneChunk = path.join(
      standaloneDir,
      '.next',
      'server',
      'chunks',
      'app-chunk.js'
    )
    const standaloneMap = path.join(
      standaloneDir,
      '.next',
      'server',
      'chunks',
      'app-chunk.js.map'
    )

    expect(
      await fs
        .stat(standaloneChunk)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)
    expect(
      await fs
        .stat(standaloneMap)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    const mapContent = await fs.readFile(standaloneMap, 'utf8')
    expect(mapContent).toContain('app/page.tsx')
  })
})
