/* eslint-env jest */

import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('disabled JS preloads', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '..'),
  })

  it('should render the page', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/Hello World/)
  })

  it('should not have JS preload links', async () => {
    const $ = await next.render$('/')
    expect($('link[rel=preload]').length).toBe(0)
  })
})
