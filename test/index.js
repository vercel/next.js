import test from 'ava'
import { resolve } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'

const dir = resolve(__dirname, 'fixtures', 'basic')

test.before(() => build(dir))

test(async t => {
  const html = await render('/stateless')
  t.true(html.includes('<h1>My component!</h1>'))
})

test(async t => {
  const html = await render('/css')
  t.true(html.includes('<style data-aphrodite="">.red_im3wl1{color:red !important;}</style>'))
  t.true(html.includes('<div class="red_im3wl1">This is red</div>'))
})

test(async t => {
  const html = await render('/stateful')
  t.true(html.includes('<div><p>The answer is 42</p></div>'))
})

test(async t => {
  const html = await (render('/head'))
  t.true(html.includes('<meta content="my meta" class="next-head"/>'))
  t.true(html.includes('<div><h1>I can haz meta tags</h1></div>'))
})

test(async t => {
  const html = await render('/async-props')
  t.true(html.includes('<p>Diego Milito</p>'))
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
