/* global expect, jasmine, describe, test, beforeAll */

'use strict'

import build from '../server/build'
import { join } from 'path'
import { render as _render } from '../server/render'

const dir = join(__dirname, 'fixtures', 'basic')

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('integration tests', () => {
  beforeAll(() => build(dir))

  test('renders a stateless component', async () => {
    const html = await render('/stateless')
    expect(html.includes('<meta charset="utf-8" class="next-head"/>')).toBeTruthy()
    expect(html.includes('<h1>My component!</h1>')).toBeTruthy()
  })

  test('renders a stateful component', async () => {
    const html = await render('/stateful')
    expect(html.includes('<div><p>The answer is 42</p></div>')).toBeTruthy()
  })

  test('header helper renders header information', async () => {
    const html = await (render('/head'))
    expect(html.includes('<meta charset="iso-8859-5" class="next-head"/>')).toBeTruthy()
    expect(html.includes('<meta content="my meta" class="next-head"/>')).toBeTruthy()
    expect(html.includes('<div><h1>I can haz meta tags</h1></div>')).toBeTruthy()
  })

  test('css helper renders styles', async () => {
    const html = await render('/css')
    expect(/\.css-\w+/.test(html)).toBeTruthy()
    expect(/<div class="css-\w+">This is red<\/div>/.test(html)).toBeTruthy()
  })

  test('renders properties populated asynchronously', async () => {
    const html = await render('/async-props')
    expect(html.includes('<p>Diego Milito</p>')).toBeTruthy()
  })

  test('renders a link component', async () => {
    const html = await render('/link')
    expect(html.includes('<a href="/about">About</a>')).toBeTruthy()
  })
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
