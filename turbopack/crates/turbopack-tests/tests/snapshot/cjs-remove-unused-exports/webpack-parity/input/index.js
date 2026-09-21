globalThis.CJS_PARITY_TRACE = []
globalThis.CJS_PARITY_SIDE_EFFECT_LEAF_EVALUATIONS = 0

const { used: direct } = require('./direct.js')
const objectLiteral = require('./object-literal.js').used
const defineProperty = require('./define-property.js').used
const computed = require('./computed.js').used
const dynamicComputed = require('./dynamic-computed.js')
const conditional = require('./conditional.js').used
const wholeReexport = require('./whole-reexport.js')
const wholeReexportLeaf = require('./whole-reexport-leaf.js')
const directPropertyReexport = require('./direct-property-reexport.js').used
const cycle = require('./cycle-a.js')
const cycleB = require('./cycle-b.js')

const result = {
  values: {
    direct,
    objectLiteral,
    defineProperty,
    computed,
    dynamicComputed: dynamicComputed.dynamic,
    dynamicFixed: dynamicComputed.fixed,
    conditional,
    wholeReexport: wholeReexport.used,
    directPropertyReexport,
  },
  trace: globalThis.CJS_PARITY_TRACE,
  sideEffectLeafEvaluations: globalThis.CJS_PARITY_SIDE_EFFECT_LEAF_EVALUATIONS,
  wholeReexportIdentity: wholeReexport === wholeReexportLeaf,
  cache: {
    wrapper: Boolean(require.cache[require.resolve('./whole-reexport.js')]),
    leaf: Boolean(require.cache[require.resolve('./whole-reexport-leaf.js')]),
  },
  cycle: {
    before: cycle.before,
    fromB: cycle.fromB,
    after: cycle.after,
    bSawBefore: cycleB.sawBefore,
    bSawAfter: cycleB.sawAfter ?? null,
  },
}

console.log(`CJS_PARITY_RESULT=${JSON.stringify(result)}`)
