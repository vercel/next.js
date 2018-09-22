// this is a more fine-tuned version of import-all.macro for our specific use-case.
const fs = require('fs')
const path = require('path')
const {createMacro} = require('babel-plugin-macros')
const requireFromString = require('require-from-string')
const glob = require('glob')

module.exports = createMacro(myMacro)

function myMacro({references, state, babel}) {
  const {types: t, template} = babel
  // let's get an array to all the post modules
  const postFilepaths = glob.sync('../pages/posts-custom/post-*.js', {
    cwd: __dirname,
    absolute: true,
  })
  // next, we'll map all post filepaths to post objects ASTs
  // (each will be effectively: {title: <title>, filename: <filename>})
  const postObjects = postFilepaths.map(postFilepath => {
    const {title} = compileAndRequire(postFilepath)
    const filename = path.basename(postFilepath, '.js')
    return t.objectExpression([
      t.objectProperty(t.stringLiteral('title'), t.stringLiteral(title)),
      t.objectProperty(t.stringLiteral('filename'), t.stringLiteral(filename)),
    ])
  })
  // now we'll create an array AST out of all those post objects
  const arrayExpression = t.arrayExpression(postObjects)

  // next let's create a new variable declaration at the top of the file
  // that's assigned to the array of posts
  const program = state.file.path
  const id = program.scope.generateUidIdentifier()
  const declaration = template(`var VAR = VAL`)({VAR: id, VAL: arrayExpression})
  // we'll add this variable declaration to the top of the file
  // NOTE: that the import for this macro is automatically removed for us by babel-plugin-macros
  program.node.body.unshift(declaration)

  // finally, we'll take every reference of the default import
  references.default.forEach(referencePath => {
    // and replace it with a reference to our new object
    referencePath.replaceWith(id)
  })

  // this function should probably be published to npm because it's kinda handy
  // Basically it allows you to require a file that needs to be compiled first.
  function compileAndRequire(filePath) {
    const babelConfig = {
      // if you were to do this in a normal next app (not an example like this one)
      // then you'd use "next/babel" instead of "../../babel"
      presets: [['../../babel', {'preset-env': {modules: 'commonjs'}}]],
    }

    const contents = fs.readFileSync(filePath)
    const {code} = babel.transformSync(contents, babelConfig)
    return requireFromString(code)
  }
}
