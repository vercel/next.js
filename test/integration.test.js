import test from 'ava'
import { join } from 'path'
import next from '../server/next'

const dir = join(__dirname, 'fixtures', 'basic')
const app = next({
  dir,
  dev: true,
  staticMarkup: true,
  quiet: true
})

test.before(() => app.prepare())

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
  t.regex(html, /\.css-\w+/)
  t.regex(html, /<div class="css-\w+">This is red<\/div>/)
})

test('renders properties populated asynchronously', async t => {
  const html = await render('/async-props')
  t.true(html.includes('<p>Diego Milito</p>'))
})

test('renders a link component', async t => {
  const html = await render('/link')
  t.true(html.includes('<a href="/about">About</a>'))
})

test(async t => {
  const html = await render('/error')
  t.regex(html, /<pre class=".+">Error: This is an expected error\n[^]+<\/pre>/)
})

test(async t => {
  const html = await render('/non-existent')
  t.regex(html, /<h1 class=".+">404<\/h1>/)
  t.regex(html, /<h2 class=".+">This page could not be found\.<\/h2>/)
})

test(async t => {
  const res = {
    finished: false,
    end () {
      this.finished = true
    }
  }
  const html = await app.renderToHTML({}, res, '/finish-response', {})
  t.falsy(html)
})

function render (pathname, query = {}) {
  return app.renderToHTML({}, {}, pathname, query)
}
