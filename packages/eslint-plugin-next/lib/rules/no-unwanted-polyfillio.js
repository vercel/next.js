const NEXT_POLYFILLED_FEATURES = [
  'Array.prototype.@@iterator',
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
  'Object.entries',
  'Object.getOwnPropertyDescriptor',
  'Object.getOwnPropertyDescriptors',
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
  'String.prototype.trim',
  'URL',
  'URLSearchParams',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Promise.prototype.finally',
  'es2015', // Should be covered by babel-preset-env instead.
  'es2016', // Should be covered by babel-preset-env instead.
  'es2017', // Should be covered by babel-preset-env instead.
  'es2018', // Should be covered by babel-preset-env instead.
  'es2019', // Should be covered by babel-preset-env instead.
  'es5', // Should be covered by babel-preset-env instead.
  'es6', // Should be covered by babel-preset-env instead.
  'es7', // Should be covered by babel-preset-env instead.
]

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
module.exports = {
  meta: {
    docs: {
      description:
        'Prohibit unwanted features to be listed in Polyfill.io tag.',
      category: 'HTML',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-unwanted-polyfillio',
    },
    fixable: null, // or "code" or "whitespace"
  },

  create: function (context) {
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
              } already shipped with Next.js. See: https://nextjs.org/docs/messages/no-unwanted-polyfillio.`,
            })
          }
        }
      },
    }
  },
}
