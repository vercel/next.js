/* eslint-env jest */

import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'disabled JS preloads',
  {
    files: join(__dirname, '..'),
  },
  ({ next }) => {
    it('should render the page', async () => {
      const html = await next.render('/')
      expect(html).toMatch(/Hello World/)
    })

    it('should not have JS preload links', async () => {
      const $ = await next.render$('/')
      expect($('link[rel=preload]').length).toBe(0)
    })
  }
)
