globalThis.CJS_PARITY_TRACE = []
globalThis.CJS_PARITY_SIDE_EFFECT_LEAF_EVALUATIONS = 0

const {
  used: direct,
} = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/direct.js')
const objectLiteral =
  require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/object-literal.js').used
const defineProperty =
  require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/define-property.js').used
const computed =
  require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/computed.js').used
const dynamicComputed = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/dynamic-computed.js')
const conditional =
  require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/conditional.js').used
const wholeReexport = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/whole-reexport.js')
const wholeReexportLeaf = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/whole-reexport-leaf.js')
const directProperty =
  require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/direct-property-reexport.js').used
const cycle = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/cycle-a.js')
const cycleB = require('../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/cycle-b.js')

it('matches the CommonJS parity runtime oracle', () => {
  expect({
    values: {
      direct,
      objectLiteral,
      defineProperty,
      computed,
      dynamicComputed: dynamicComputed.dynamic,
      dynamicFixed: dynamicComputed.fixed,
      conditional,
      wholeReexport: wholeReexport.used,
      directPropertyReexport: directProperty,
    },
    trace: globalThis.CJS_PARITY_TRACE,
    sideEffectLeafEvaluations:
      globalThis.CJS_PARITY_SIDE_EFFECT_LEAF_EVALUATIONS,
    wholeReexportIdentity: wholeReexport === wholeReexportLeaf,
    cache: {
      wrapper: Boolean(
        require.cache[
          require.resolve(
            '../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/whole-reexport.js'
          )
        ]
      ),
      leaf: Boolean(
        require.cache[
          require.resolve(
            '../../../../../snapshot/cjs-remove-unused-exports/webpack-parity/input/whole-reexport-leaf.js'
          )
        ]
      ),
    },
    cycle: {
      before: cycle.before,
      fromB: cycle.fromB,
      after: cycle.after,
      bSawBefore: cycleB.sawBefore,
      bSawAfter: cycleB.sawAfter ?? null,
    },
  }).toEqual({
    values: {
      direct: 'USED_DIRECT_EXPORT',
      objectLiteral: 'USED_OBJECT_LITERAL',
      defineProperty: 'USED_DEFINE_PROPERTY',
      computed: 'USED_COMPUTED_KEY',
      dynamicComputed: 'USED_DYNAMIC_COMPUTED',
      dynamicFixed: 'USED_DYNAMIC_FIXED',
      conditional: 'USED_CONDITIONAL_ELSE',
      wholeReexport: 'USED_WHOLE_REEXPORT_LEAF',
      directPropertyReexport: 'USED_DIRECT_PROPERTY_REEXPORT_LEAF',
    },
    trace: [
      'conditional:condition',
      'conditional:unused-rhs-else',
      'direct-property:side-effect-leaf',
    ],
    sideEffectLeafEvaluations: 1,
    wholeReexportIdentity: true,
    cache: { wrapper: true, leaf: true },
    cycle: {
      before: 'USED_CYCLE_A_BEFORE',
      fromB: 'USED_CYCLE_B_VALUE',
      after: 'USED_CYCLE_A_AFTER',
      bSawBefore: 'USED_CYCLE_A_BEFORE',
      bSawAfter: null,
    },
  })
})
