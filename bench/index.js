
import { resolve } from 'path'
import build from '../server/build'
import { render as _render } from '../server/render'
import Benchmark from 'benchmark'

const dir = resolve(__dirname, 'fixtures', 'basic')
const suite = new Benchmark.Suite('Next.js');

suite
.on('start', async () => build(dir))

.add('Tiny stateless component', async p => {
  await render('/stateless')
  p.resolve()
}, { defer: true })

.add('Big stateless component', async p => {
  await render('/stateless-big')
  p.resolve()
}, { defer: true })

.add('Stateful component with a loooot of css', async p => {
  await render('/css')
  p.resolve()
}, { defer: true })

module.exports = suite

function render (url, ctx) {
  return _render(url, ctx, { dir, staticMarkup: true })
}
