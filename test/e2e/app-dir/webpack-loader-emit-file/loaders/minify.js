module.exports = function () {
  const { outputPath } = this.getOptions()
  if ([].concat(this.target).includes('web')) {
    const code = '// minify-comment\nconsole.log( "minify" + "-me" );\n'
    this.emitFile(`${outputPath}/minify-me.js`, code)
    this.emitFile(`${outputPath}/already-minified.js`, code, null, {
      minimized: true,
    })
    const css = '/* minify-comment */\np {\n  color: red;\n}\n'
    this.emitFile(`${outputPath}/minify-me.css`, css)
    this.emitFile(`${outputPath}/already-minified.css`, css, null, {
      minimized: true,
    })
  }
  return 'export default "minify"'
}
