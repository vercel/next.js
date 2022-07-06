import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import fs from 'fs-extra'
import path from 'path'

describe('Middleware source maps', () => {
  let next: NextInstance

  afterEach(() => next.destroy())

  it('generates a source map', async () => {
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
    })

    const middlewarePath = path.resolve(
      next.testDir,
      '.next/server/middleware.js'
    )
    expect(await fs.pathExists(middlewarePath)).toEqual(true)
    expect(await fs.pathExists(`${middlewarePath}.map`)).toEqual(true)
  })
})
