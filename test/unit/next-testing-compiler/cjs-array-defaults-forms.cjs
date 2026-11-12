// CommonJS source forms exercised by the default-parameter regression tests.
const setup =
  "globalThis.__cjsNamedShorthandRoot=(globalThis.__cjsNamedShorthandRoot||0)+1;const evaluation=globalThis.__cjsNamedShorthandRoot;const dependency=require('./dependency.cjs');const resolveDefault=()=>{globalThis.__cjsNamedShorthandDefaults=(globalThis.__cjsNamedShorthandDefaults||0)+1;return dependency.value+'@'+evaluation};"
const result =
  "{evaluation,dependency:dependency.value,valueType:typeof adopted,value:typeof adopted==='function'?adopted.name:adopted??null,receiver:this?.receiver??null,valueIsCurrent:adopted===this?.current}"

const forms = {
  'async-generator:anonymous-array': `${setup}module.exports=async function*([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}}\n`,
  'async-generator:binding-array': `${setup}async function* callable([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}};module.exports=callable\n`,
  'async-generator:named-array': `${setup}module.exports=async function* callable([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}}\n`,
  'async:anonymous-array': `${setup}module.exports=async function([adopted=resolveDefault()]){return ${result}}\n`,
  'async:arrow-array': `${setup}module.exports=async ([adopted=resolveDefault()])=>(${result})\n`,
  'async:binding-array': `${setup}async function callable([adopted=resolveDefault()]){return ${result}};module.exports=callable\n`,
  'async:named-array': `${setup}module.exports=async function callable([adopted=resolveDefault()]){return ${result}}\n`,
  'generator:anonymous-array': `${setup}module.exports=function*([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}}\n`,
  'generator:binding-array': `${setup}function* callable([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}};module.exports=callable\n`,
  'generator:named-array': `${setup}module.exports=function* callable([adopted=resolveDefault()]){yield ${result};return {returned:true,evaluation}}\n`,
  'sync:anonymous-array': `${setup}module.exports=function([adopted=resolveDefault()]){return ${result}}\n`,
  'sync:arrow-array': `${setup}module.exports=([adopted=resolveDefault()])=>(${result})\n`,
  'sync:binding-array': `${setup}function callable([adopted=resolveDefault()]){return ${result}};module.exports=callable\n`,
  'sync:named-array': `${setup}module.exports=function callable([adopted=resolveDefault()]){return ${result}}\n`,
}

module.exports = { forms }
