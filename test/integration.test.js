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
    const response = await render('/stateless')
    expect(response.html.includes('<meta charset="utf-8" class="next-head"/>')).toBeTruthy()
    expect(response.html.includes('<h1>My component!</h1>')).toBeTruthy()
  })

  test('renders a stateful component', async () => {
    const response = await render('/stateful')
    expect(response.html.includes('<div><p>The answer is 42</p></div>')).toBeTruthy()
  })

  test('header helper renders header information', async () => {
    const response = await (render('/head'))
    expect(response.html.includes('<meta charset="iso-8859-5" class="next-head"/>')).toBeTruthy()
    expect(response.html.includes('<meta content="my meta" class="next-head"/>')).toBeTruthy()
    expect(response.html.includes('<div><h1>I can haz meta tags</h1></div>')).toBeTruthy()
  })

  test('css helper renders styles', async () => {
    const response = await render('/css')
    expect(/\.css-\w+/.test(response.html)).toBeTruthy()
    expect(/<div class="css-\w+">This is red<\/div>/.test(response.html)).toBeTruthy()
  })

  test('renders properties populated asynchronously', async () => {
    const response = await render('/async-props')
    expect(response.html.includes('<p>Diego Milito</p>')).toBeTruthy()
  })

  test('renders a link component', async () => {
    const response = await render('/link')
    expect(response.html.includes('<a href="/about">About</a>')).toBeTruthy()
  })
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
