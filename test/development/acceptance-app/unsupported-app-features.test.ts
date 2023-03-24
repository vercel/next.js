/* eslint-env jest */
import path from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'
import { getRedboxDescription, hasRedbox } from 'next-test-utils'

// TODO: investigate this test flaking in CI
describe.skip('should skip for now', () => {
  createNextDescribe(
    'Error Overlay unsupported app features',
    {
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    },
    ({ next }) => {
      it('should show error exporting AMP config in app dir', async () => {
        const browser = await next.browser('/')

        // Add AMP export
        await next.patchFile(
          'app/page.js',
          `
          export const config = { amp: true }

          import Component from '../index'
          export default function Page() {
            return <Component />
          }
        `
        )

        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxDescription(browser)).toInclude(
          'AMP is not supported in the app directory. If you need to use AMP it will continue to be supported in the pages directory.'
        )
      })
    }
  )
})
