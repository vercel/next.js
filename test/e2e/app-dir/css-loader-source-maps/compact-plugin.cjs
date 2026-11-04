module.exports = () => ({
  postcssPlugin: 'compact-source-map-test',
  Once(root) {
    root.walk((node) => {
      node.raws.before = ''
      node.raws.after = ''
      if (node.type === 'rule') node.raws.between = ''
      if (node.type === 'decl') node.raws.between = ':'
    })
    root.raws.after = ''
  },
})
module.exports.postcss = true
