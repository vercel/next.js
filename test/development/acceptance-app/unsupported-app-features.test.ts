/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'Error Overlay unsupported app features',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should show error exporting AMP config in app dir', async () => {
      const { session, cleanup } = await sandbox(next)

      // Add AMP exprot
      await session.patch(
        'app/page.js',
        `
        'use client'

        export const config = { amp: true }

        import Component from '../index'
        export default function Page() {
          return <Component />
        }
      `
      )

      await session.hasRedbox(true)
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/page.js
        Error: 
          x AMP is not supported in the app directory. If you need to use AMP it will continue to be supported in the pages directory.
           ,-[1:1]
         1 | 
         2 |         'use client'
         3 | 
         4 |         export const config = { amp: true }
           :         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 | 
         6 |         import Component from '../index'
         7 |         export default function Page() {
           \`----

        Import trace for requested module:
        ./app/page.js"
      `)

      await cleanup()
    })
  }
)
