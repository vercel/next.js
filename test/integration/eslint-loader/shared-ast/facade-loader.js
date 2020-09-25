const fn = function (content, map, { sharedBabelAST }) {
  if (!sharedBabelAST) {
    throw new Error('AST not shared by ES-loader')
  }
  debugger
  sharedBabelAST.program.body[0].declaration.body.body[0].argument.children[0].value =
    'ModifiedIndex'
  sharedBabelAST.program.body[0].declaration.body.body[0].argument.children[0].raw =
    'ModifiedIndex'
  this.callback(null, content, map, { sharedBabelAST })
}

module.exports = {
  default: fn,
}
