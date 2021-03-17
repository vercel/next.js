const StyleSheet = require('style-sheet')
const setup = require('style-sheet/lib/cjs/createElement')

const stylePropName = 'css'
module.exports.createElement = setup(StyleSheet, stylePropName)
