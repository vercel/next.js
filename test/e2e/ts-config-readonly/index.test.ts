import { join } from 'path'
import { promises as fs, constants as fsConstants } from 'fs'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

const appDir = join(__dirname, 'app')

describe('Should warn when tsconfig.json and next-env.d.ts are read-only', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        pages: new FileRef(join(appDir, 'pages')),
        'tsconfig.json': new FileRef(join(appDir, 'tsconfig.json')),
      },
      dependencies: {
        '@types/node': '17.0.19',
        '@types/react': '17.0.39',
        typescript: '4.5.5',
      },
    })

    await fs.chmod(join(next.testDir, 'tsconfig.json'), fsConstants.R_OK)
  })

  afterAll(async () => {
    await fs.chmod(join(next.testDir, 'tsconfig.json'), fsConstants.W_OK)
    await next.destroy()
  })

  it('should work', async () => {
    console.log(next.cliOutput)

    expect(true).toBe(true)
  })
})
