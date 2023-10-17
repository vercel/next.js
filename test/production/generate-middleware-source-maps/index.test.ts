import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import fs from 'fs-extra'
import path from 'path'

describe('Middleware source maps', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function () { return <div>Hello, world!</div> }
        `,
        'pages/api/edge.js': `
          export const config = { runtime: 'edge' };
          export default function (req) {
            return new Response("Hello from " + req.url);
          }
        `,
        'middleware.js': `
          import { NextResponse } from "next/server";
          export default function middleware() { 
            return NextResponse.next();
          } 
        `,
      },
    })
  })
  afterAll(() => next.destroy())

  it('generates a source map for Middleware', async () => {
    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(true)
  })

  it('generates a source map for Edge API', async () => {
    const edgePath = path.resolve(
      next.testDir,
      '.next/server/pages/api/edge.js'
    )
    expect(await fs.pathExists(edgePath)).toEqual(true)
    expect(await fs.pathExists(`${edgePath}.map`)).toEqual(true)
  })
})
