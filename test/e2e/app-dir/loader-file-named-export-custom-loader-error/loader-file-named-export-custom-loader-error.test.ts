import { nextTestSetup } from 'e2e-utils'
import { getRedboxHeader, hasRedbox } from 'next-test-utils'

async function testDev(browser, errorRegex) {
  expect(await hasRedbox(browser)).toBe(true)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('loader-file-named-export-custom-loader-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show an error saying that only default export is allowed.', async () => {
    const browser = await next.browser('/')
    await testDev(
      browser,
      'The loader file must export a default function that returns a string.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config'
    )
  })
})
