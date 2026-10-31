module.exports = () => ({
  postcssPlugin: 'emit-asset-messages',
  Once(_root, { result }) {
    result.messages.push(
      {
        type: 'asset',
        file: 'static/media/postcss-text.txt',
        content: 'postcss-text-content',
      },
      {
        type: 'asset',
        file: 'static/media/postcss-binary.bin',
        content: Buffer.from([0, 255, 128, 10]),
      }
    )
  },
})
module.exports.postcss = true
