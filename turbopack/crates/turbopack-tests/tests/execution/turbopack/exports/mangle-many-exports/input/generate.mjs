// Not part of the test: regenerates the two 60-export modules and the consumer that imports each
// of them by name. Run from this directory:
//   node generate.mjs
import { writeFileSync } from 'node:fs'

const count = 60
const names = Array.from(
  { length: count },
  (_, i) => `exportNumber${String(i).padStart(2, '0')}`
)

const moduleSource = (withInfo) =>
  [
    ...names.map((name, i) => {
      const n = String(i).padStart(2, '0')
      return `export const ${name} = 'value-${n}'`
    }),
    '',
    'export const exportsInfo = {',
    ...names.map((name) => `  ${name}: __webpack_exports_info__.${name},`),
    '}',
    '',
  ].join('\n')

// Read through a namespace binding with a computed key, so this one has to keep its names.
writeFileSync('many.js', moduleSource())
// Imported entirely by name, so this one is mangled with a two-character table.
writeFileSync('many-named.js', moduleSource())

writeFileSync(
  'consume.js',
  [
    'import {',
    ...names.map((name) => `  ${name},`),
    '  exportsInfo,',
    "} from './many-named'",
    '',
    'export const values = () => [',
    ...names.map((name) => `  ${name},`),
    ']',
    '',
    'export { exportsInfo }',
    '',
  ].join('\n')
)
