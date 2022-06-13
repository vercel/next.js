import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import fs from 'fs-extra'
import path from 'path'

const files = {
  'pages/index.js': `
    export default function () { return <div>Hello, world!</div> }
  `,
  'middleware.js': `
    import { NextResponse } from "next/server";
    export default function middleware() { 
      return NextResponse.next();
    } 
  `,
}

describe('experimental.middlewareSourceMaps: true', () => {
  let next: NextInstance

  const nextConfig = { experimental: { middlewareSourceMaps: true } }

  afterEach(() => next.destroy())

  it('generates a source map', async () => {
    next = await createNext({ nextConfig, files })

    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(true)
  })

  it('generates a source map from src', async () => {
    next = await createNext({
      nextConfig,
      files: Object.fromEntries(
        Object.entries(files).map(([filename, content]) => [
          `src/${filename}`,
          content,
        ])
      ),
    })

    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/src/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(true)
  })
})

describe('experimental.middlewareSourceMaps: false', () => {
  let next: NextInstance

  afterEach(() => next.destroy())

  it('does not generate a source map', async () => {
    next = await createNext({ files })
    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(false)
  })
})
