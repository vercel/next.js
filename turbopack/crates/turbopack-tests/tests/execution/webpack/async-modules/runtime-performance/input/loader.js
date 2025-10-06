/** @type {import("../../../../").LoaderDefinition<{ i: string }>} */
module.exports = function () {
  const options = this.getOptions()
  const i = +options.i
  let src = `import n from "./async.js";\n`
  if (i > 0) {
    src += `import a from "./loader.js?i=${i - 1}&a!./loader.js";\n`
    src += `import b from "./loader.js?i=${i - 1}&b!./loader.js";\n`
    src += `export default n + a + b;\n`
  } else {
    src += `export default n;\n`
  }
  return src
}
