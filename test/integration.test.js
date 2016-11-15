import test from 'ava'
import { join } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'

const dir = join(__dirname, 'fixtures', 'basic')

test.before(() => build(dir))

test('renders a stateless component', async t => {
  const html = await render('/stateless')
  t.true(html.includes('<meta charset="utf-8" class="next-head"/>'))
  t.true(html.includes('<h1>My component!</h1>'))
})

test('renders a stateful component', async t => {
  const html = await render('/stateful')
  t.true(html.includes('<div><p>The answer is 42</p></div>'))
})

test('header helper renders header information', async t => {
  const html = await (render('/head'))
  t.true(html.includes('<meta charset="iso-8859-5" class="next-head"/>'))
  t.true(html.includes('<meta content="my meta" class="next-head"/>'))
  t.true(html.includes('<div><h1>I can haz meta tags</h1></div>'))
})

test('css helper renders styles', async t => {
  const html = await render('/css')
  t.true(html.includes('.css-im3wl1'))
  t.true(html.includes('<div class="css-im3wl1">This is red</div>'))
})

test('renders properties populated asynchronously', async t => {
  const html = await render('/async-props')
  t.true(html.includes('<p>Diego Milito</p>'))
})

test('renders a link component', async t => {
  const html = await render('/link')
  t.true(html.includes('<a href="/about">About</a>'))
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
