import('./vercel.mjs').then(console.log)
import(/* webpackIgnore: false */ './vercel.mjs').then(console.log)
console.log(require('./vercel.cjs'))
new Worker(
  /* turbopackIgnore: false */ new URL('./vercel.cjs', import.meta.url)
)

// turbopack shouldn't attempt to bundle these, and they should be preserved in the output
import(/* webpackIgnore: true */ './ignore.mjs')
import(/* turbopackIgnore: true */ './ignore.mjs')

// this should work for cjs requires too
require(/* webpackIgnore: true */ './ignore.cjs')
require(/* turbopackIgnore: true */ './ignore.cjs')

new Worker(
  /* turbopackIgnore: true */ new URL('./ignore-worker.cjs', import.meta.url)
)
new Worker(
  /* webpackIgnore: true */ new URL('./ignore-worker.cjs', import.meta.url)
)

export function foo(plugin) {
  return require(/* turbopackIgnore: true */ plugin)
}
