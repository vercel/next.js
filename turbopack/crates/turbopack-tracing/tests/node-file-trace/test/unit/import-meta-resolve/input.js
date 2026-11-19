import { readFileSync } from 'fs'

const worker = import.meta.resolve('./lib/worker.js')
const wasm = import.meta.resolve('dep/asset.wasm')
readFileSync(new URL(wasm))
const locale = import.meta['resolve'](
  process.env.LOCALE === 'de' ? './lib/de.js' : './lib/en.js'
)
console.log(worker, locale)
