import test from 'ava'
import { resolve } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'

const dir = resolve(__dirname, 'fixtures', 'basic')

test.before(() => build(dir))

test(async (t) => {
  const html = await render('/stateless')
  console.log(html)
  t.true(html.includes('<h1>My component!</h1>'))
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
