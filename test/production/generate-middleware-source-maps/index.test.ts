import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import fs from 'fs-extra'
import path from 'path'

describe('experimental.middlewareSourceMaps: true', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      nextConfig: {
        experimental: {
          middlewareSourceMaps: true,
        },
      },
      files: {
        'pages/index.js': `
          export default function () { return <div>Hello, world!</div> }
        `,
        'middleware.js': `
          import { NextResponse } from "next/server";
          export default function middleware() { 
            return NextResponse.next();
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('generates a source map', async () => {
    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(true)
  })
})

describe('experimental.middlewareSourceMaps: false', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function () { return <div>Hello, world!</div> }
        `,
        'middleware.js': `
          import { NextResponse } from "next/server";
          export default function middleware() {
            return NextResponse.next();
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('does not generate a source map', async () => {
    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(false)
  })
})
