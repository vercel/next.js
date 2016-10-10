import test from 'ava'
import { resolve } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'

const dir = resolve(__dirname, 'fixtures', 'basic')

test.before(() => build(dir))

test(async (t) => {
  const html = await render('/stateless')
  t.true(html.includes('<h1>My component!</h1>'))
})

test(async (t) => {
  const html = await render('/css')
  t.true(html.includes('<style data-aphrodite="">.red_im3wl1{color:red !important;}</style>'))
  t.true(html.includes('<div class="red_im3wl1">This is red</div>'))
})

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
