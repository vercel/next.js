const effects = []
module.exports = effects

function unusedFunctionRedeclared() {}
var unusedFunctionRedeclared = effects.push('function then var')

var unusedVarThenFunction = effects.push('var then function')
function unusedVarThenFunction() {}

function unusedFunctionNestedVar() {}
if (effects.length) {
  var unusedFunctionNestedVar = effects.push('function then nested var')
}
