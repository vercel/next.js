/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import { check } from 'next-test-utils'
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

      // Make sure the page is rendering correctly first before patching to a bad file
      expect(
        await session.evaluate(() => document.querySelector('body').textContent)
      ).toContain('new sandbox')

      // Add AMP export
      await session.patch(
        'app/page.js',
        `
        export const config = { amp: true }

        import Component from '../index'
        export default function Page() {
          return <Component />
        }
      `
      )

      await check(
        async () => ((await session.hasRedbox(true)) ? 'redbox' : 'nothing'),
        /redbox/
      )
      expect(await session.getRedboxDescription()).toInclude(
        'AMP is not supported in the app directory. If you need to use AMP it will continue to be supported in the pages directory.'
      )

      await cleanup()
    })
  }
)
