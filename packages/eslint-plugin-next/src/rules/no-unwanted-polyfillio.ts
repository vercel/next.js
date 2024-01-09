import { defineRule } from '../utils/define-rule'

// Keep in sync with next.js polyfills file : https://github.com/vercel/next.js/blob/master/packages/next-polyfill-nomodule/src/index.js
const NEXT_POLYFILLED_FEATURES = [
  'Array.prototype.@@iterator',
  'Array.prototype.at',
  'Array.prototype.copyWithin',
  'Array.prototype.fill',
  'Array.prototype.find',
  'Array.prototype.findIndex',
  'Array.prototype.flatMap',
  'Array.prototype.flat',
  'Array.from',
  'Array.prototype.includes',
  'Array.of',
  'Function.prototype.name',
  'fetch',
  'Map',
  'Number.EPSILON',
  'Number.Epsilon',
  'Number.isFinite',
  'Number.isNaN',
  'Number.isInteger',
  'Number.isSafeInteger',
  'Number.MAX_SAFE_INTEGER',
  'Number.MIN_SAFE_INTEGER',
  'Number.parseFloat',
  'Number.parseInt',
  'Object.assign',
  'Object.entries',
  'Object.fromEntries',
  'Object.getOwnPropertyDescriptor',
  'Object.getOwnPropertyDescriptors',
  'Object.hasOwn',
  'Object.is',
  'Object.keys',
  'Object.values',
  'Reflect',
  'Set',
  'Symbol',
  'Symbol.asyncIterator',
  'String.prototype.codePointAt',
  'String.prototype.endsWith',
  'String.fromCodePoint',
  'String.prototype.includes',
  'String.prototype.@@iterator',
  'String.prototype.padEnd',
  'String.prototype.padStart',
  'String.prototype.repeat',
  'String.raw',
  'String.prototype.startsWith',
  'String.prototype.trimEnd',
  'String.prototype.trimStart',
  'URL',
  'URL.prototype.toJSON',
  'URLSearchParams',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Promise.prototype.finally',
  'es2015', // Should be covered by babel-preset-env instead.
  'es2016', // contains polyfilled 'Array.prototype.includes', 'String.prototype.padEnd' and 'String.prototype.padStart'
  'es2017', // contains polyfilled 'Object.entries', 'Object.getOwnPropertyDescriptors', 'Object.values', 'String.prototype.padEnd' and 'String.prototype.padStart'
  'es2018', // contains polyfilled 'Promise.prototype.finally' and ''Symbol.asyncIterator'
  'es2019', // Contains polyfilled 'Object.fromEntries' and polyfilled 'Array.prototype.flat', 'Array.prototype.flatMap', 'String.prototype.trimEnd' and 'String.prototype.trimStart'
  'es5', // Should be covered by babel-preset-env instead.
  'es6', // Should be covered by babel-preset-env instead.
  'es7', // contains polyfilled 'Array.prototype.includes', 'String.prototype.padEnd' and 'String.prototype.padStart'
]

const url = 'https://nextjs.org/docs/messages/no-unwanted-polyfillio'

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
export = defineRule({
  meta: {
    docs: {
      description: 'Prevent duplicate polyfills from Polyfill.io.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },

  create(context) {
    let scriptImport = null

    return {
      ImportDeclaration(node) {
        if (node.source && node.source.value === 'next/script') {
          scriptImport = node.specifiers[0].local.name
        }
      },
      JSXOpeningElement(node) {
        if (
          node.name &&
          node.name.name !== 'script' &&
          node.name.name !== scriptImport
        ) {
          return
        }
        if (node.attributes.length === 0) {
          return
        }

        const srcNode = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'src'
        )
        if (!srcNode || srcNode.value.type !== 'Literal') {
          return
        }
        const src = srcNode.value.value
        if (
          src.startsWith('https://cdn.polyfill.io/v2/') ||
          src.startsWith('https://polyfill.io/v3/')
        ) {
          const featureQueryString = new URL(src).searchParams.get('features')
          const featuresRequested = (featureQueryString || '').split(',')
          const unwantedFeatures = featuresRequested.filter((feature) =>
            NEXT_POLYFILLED_FEATURES.includes(feature)
          )
          if (unwantedFeatures.length > 0) {
            context.report({
              node,
              message: `No duplicate polyfills from Polyfill.io are allowed. ${unwantedFeatures.join(
                ', '
              )} ${
                unwantedFeatures.length > 1 ? 'are' : 'is'
              } already shipped with Next.js. See: ${url}`,
            })
          }
        }
      },
    }
  },
})
