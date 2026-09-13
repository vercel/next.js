import constantDefault, {
  constant,
  constant as aliasedConstant,
  live,
  setLive,
} from './reexport.js'

console.log(
  constant,
  constant,
  aliasedConstant,
  { constant },
  constantDefault(),
  live
)
setLive('updated')
console.log(live)
