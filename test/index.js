import test from 'ava'
import { join } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'

const dir = join(__dirname, 'fixtures', 'basic')

test.before(() => build(dir))

test(async t => {
  const html = await render('/stateless')
  t.true(html.includes('<meta charset="utf-8" class="next-head"/>'))
  t.true(html.includes('<h1>My component!</h1>'))
})

test(async t => {
  const html = await render('/css')
  t.regex(html, /\.css-\w+/)
  t.regex(html, /<div class="css-\w+">This is red<\/div>/)
})

test(async t => {
  const html = await render('/stateful')
  t.true(html.includes('<div><p>The answer is 42</p></div>'))
})

test(async t => {
  const html = await (render('/head'))
  t.true(html.includes('<meta charset="iso-8859-5" class="next-head"/>'))
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
