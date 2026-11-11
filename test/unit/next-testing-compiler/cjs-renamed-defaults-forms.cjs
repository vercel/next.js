// CommonJS source forms exercised by the default-parameter regression tests.
const setup =
  "globalThis.__cjsNamedShorthandRoot=(globalThis.__cjsNamedShorthandRoot||0)+1;const evaluation=globalThis.__cjsNamedShorthandRoot;const dependency=require('./dependency.cjs');const resolveDefault=()=>{globalThis.__cjsNamedShorthandDefaults=(globalThis.__cjsNamedShorthandDefaults||0)+1;return dependency.value+'@'+evaluation};"
const result =
  "{evaluation,dependency:dependency.value,valueType:typeof adopted,value:typeof adopted==='function'?adopted.name:adopted??null,receiver:this?.receiver??null,valueIsCurrent:adopted===this?.current}"

const forms = {
  'async-generator:anonymous-renamed': `${setup}module.exports=async function*({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}}\n`,
  'async-generator:binding-renamed': `${setup}async function* callable({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}};module.exports=callable\n`,
  'async-generator:named-renamed': `${setup}module.exports=async function* callable({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}}\n`,
  'async:anonymous-renamed': `${setup}module.exports=async function({value:adopted=resolveDefault()}){return ${result}}\n`,
  'async:arrow-renamed': `${setup}module.exports=async ({value:adopted=resolveDefault()})=>(${result})\n`,
  'async:binding-renamed': `${setup}async function callable({value:adopted=resolveDefault()}){return ${result}};module.exports=callable\n`,
  'async:named-renamed': `${setup}module.exports=async function callable({value:adopted=resolveDefault()}){return ${result}}\n`,
  'generator:anonymous-renamed': `${setup}module.exports=function*({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}}\n`,
  'generator:binding-renamed': `${setup}function* callable({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}};module.exports=callable\n`,
  'generator:named-renamed': `${setup}module.exports=function* callable({value:adopted=resolveDefault()}){yield ${result};return {returned:true,evaluation}}\n`,
  'sync:anonymous-renamed': `${setup}module.exports=function({value:adopted=resolveDefault()}){return ${result}}\n`,
  'sync:arrow-renamed': `${setup}module.exports=({value:adopted=resolveDefault()})=>(${result})\n`,
  'sync:binding-renamed': `${setup}function callable({value:adopted=resolveDefault()}){return ${result}};module.exports=callable\n`,
  'sync:named-renamed': `${setup}module.exports=function callable({value:adopted=resolveDefault()}){return ${result}}\n`,
}

module.exports = { forms }
