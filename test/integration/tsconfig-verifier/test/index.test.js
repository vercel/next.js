/* eslint-env jest */

import { writeFile } from 'fs'
import { createFile, exists, readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import path from 'path'

jest.setTimeout(1000 * 60 * 5)

describe('tsconfig.json verifier', () => {
  const appDir = path.join(__dirname, '../')
  const tsConfig = path.join(appDir, 'tsconfig.json')

  beforeEach(async () => {
    await remove(tsConfig)
  })

  afterEach(async () => {
    await remove(tsConfig)
  })

  it('Creates a default tsconfig.json when one is missing', async () => {
    expect(await exists(tsConfig)).toBe(false)
    const { code } = await nextBuild(appDir)
    expect(code).toBe(0)
    expect(await readFile(tsConfig, 'utf8')).toMatchInlineSnapshot(`
      "{
        \\"compilerOptions\\": {
          \\"target\\": \\"es5\\",
          \\"lib\\": [
            \\"dom\\",
            \\"dom.iterable\\",
            \\"esnext\\"
          ],
          \\"allowJs\\": true,
          \\"skipLibCheck\\": true,
          \\"strict\\": false,
          \\"forceConsistentCasingInFileNames\\": true,
          \\"noEmit\\": true,
          \\"esModuleInterop\\": true,
          \\"module\\": \\"esnext\\",
          \\"moduleResolution\\": \\"node\\",
          \\"resolveJsonModule\\": true,
          \\"isolatedModules\\": true,
          \\"jsx\\": \\"preserve\\"
        },
        \\"exclude\\": [
          \\"node_modules\\"
        ],
        \\"include\\": [
          \\"next-env.d.ts\\",
          \\"**/*.ts\\",
          \\"**/*.tsx\\"
        ]
      }
      "
    `)
  })

  it('Works with an empty tsconfig.json (docs)', async () => {
    expect(await exists(tsConfig)).toBe(false)

    await createFile(tsConfig)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await readFile(tsConfig, 'utf8')).toBe('')

    const { code } = await nextBuild(appDir)
    expect(code).toBe(0)

    expect(await readFile(tsConfig, 'utf8')).toMatchInlineSnapshot(`
      "{
        \\"compilerOptions\\": {
          \\"target\\": \\"es5\\",
          \\"lib\\": [
            \\"dom\\",
            \\"dom.iterable\\",
            \\"esnext\\"
          ],
          \\"allowJs\\": true,
          \\"skipLibCheck\\": true,
          \\"strict\\": false,
          \\"forceConsistentCasingInFileNames\\": true,
          \\"noEmit\\": true,
          \\"esModuleInterop\\": true,
          \\"module\\": \\"esnext\\",
          \\"moduleResolution\\": \\"node\\",
          \\"resolveJsonModule\\": true,
          \\"isolatedModules\\": true,
          \\"jsx\\": \\"preserve\\"
        },
        \\"exclude\\": [
          \\"node_modules\\"
        ],
        \\"include\\": [
          \\"next-env.d.ts\\",
          \\"**/*.ts\\",
          \\"**/*.tsx\\"
        ]
      }
      "
    `)
  })

  it('Updates an existing tsconfig.json without losing comments', async () => {
    expect(await exists(tsConfig)).toBe(false)

    await writeFile(
      tsConfig,
      `
      // top-level comment
      {
        // in-object comment 1
        "compilerOptions": {
          // in-object comment
          "esModuleInterop": false, // this should be true
          "module": "commonjs" // should not be commonjs
          // end-object comment
        }
        // in-object comment 2
      }
      // end comment
      `
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { code } = await nextBuild(appDir)
    expect(code).toBe(0)

    // Weird comma placement until this issue is resolved:
    // https://github.com/kaelzhang/node-comment-json/issues/21
    expect(await readFile(tsConfig, 'utf8')).toMatchInlineSnapshot(`
      "// top-level comment
      {
        // in-object comment 1
        \\"compilerOptions\\": {
          // in-object comment
          \\"esModuleInterop\\": true, // this should be true
          \\"module\\": \\"esnext\\" // should not be commonjs
          // end-object comment
          ,
          \\"target\\": \\"es5\\",
          \\"lib\\": [
            \\"dom\\",
            \\"dom.iterable\\",
            \\"esnext\\"
          ],
          \\"allowJs\\": true,
          \\"skipLibCheck\\": true,
          \\"strict\\": false,
          \\"forceConsistentCasingInFileNames\\": true,
          \\"noEmit\\": true,
          \\"moduleResolution\\": \\"node\\",
          \\"resolveJsonModule\\": true,
          \\"isolatedModules\\": true,
          \\"jsx\\": \\"preserve\\"
        }
        // in-object comment 2
        ,
        \\"exclude\\": [
          \\"node_modules\\"
        ],
        \\"include\\": [
          \\"next-env.d.ts\\",
          \\"**/*.ts\\",
          \\"**/*.tsx\\"
        ]
      }
      // end comment
      "
    `)
  })
})
