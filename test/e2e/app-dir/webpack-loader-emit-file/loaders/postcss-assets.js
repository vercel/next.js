module.exports = (options) => ({
  postcssPlugin: 'emit-mapped-asset',
  Once(_root, { result }) {
    result.messages.push({
      type: 'asset',
      file: `${options.outputPath}/postcss-emitted.css`,
      content: 'p { color: blue; }',
      sourceMap: {
        version: 3,
        sources: ['postcss-source.css'],
        sourcesContent: ['p { color: blue; }'],
        names: [],
        mappings: 'AAAA',
      },
      info: {
        sourceFilename: 'postcss-source.css',
        immutable: true,
        custom: { plugin: 'postcss' },
      },
    })
  },
})
module.exports.postcss = true
