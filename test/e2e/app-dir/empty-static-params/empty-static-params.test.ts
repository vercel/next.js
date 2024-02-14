import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'empty-static-params',
  {
    files: __dirname,
  },
  () => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should have built', async () => {})
  }
)
