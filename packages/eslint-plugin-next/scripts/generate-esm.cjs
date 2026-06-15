'use strict'
// Writes dist/index.mjs after the SWC CJS build.
//
// Node.js only creates synthetic named exports from own *data* properties on
// module.exports, not from accessor (getter) properties. SWC emits getter-based
// CJS exports to preserve ESM live-binding semantics, so importing named exports
// directly from the compiled dist/index.js via ESM ("import {configs} from ...") fails.
//
// This thin ESM wrapper imports the CJS default and explicitly re-exports the
// named bindings as data properties, making named ESM imports work correctly.
const { writeFileSync } = require('fs')

writeFileSync(
  'dist/index.mjs',
  "import cjs from './index.js'\nexport const { rules, configs } = cjs\nexport default cjs\n"
)
